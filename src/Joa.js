/**
 * JOA.js, provides a way to communicate with the backoffice of Munisense using Javascript.<br />
 * Created by Alex Burghardt, https://github.com/aal89<br />
 * license MIT, http://www.opensource.org/licenses/mit-license<br />
 * Project Page: https://github.com/munisense/JOA-js-client<br />
 * Copyright (c) 2016 Munisense<br />
 *
 * @module JOA
 **/
var JOA = (function () {
    "use strict";
    /**
     * Represents the current set backoffice url. <br/>
     *
     * @property JOA.url
     * @type {String}
     */
    var url = null;
    /**
     * Special characters used by the JOA protocol. <br/>
     *
     * @property JOA.char
     * @type {Object}
     */
    var char = {
        tab: "\u0009",
        eol: "\u000A" //might also be \u000D or a combination of both, tests should be conclusive
    };
    /**
     * The header object used to construct a valid header for a particular request. <br/><br/>
     * gatewayIdentifier: The gateway identifier is a 32bit value formatted as an IP address.
     * This IP address will not be the address of the sending node or the backoffice, but
     * a virtual identifier assigned to this device.<br/>
     * The address will be an address in the private range defined in RFC1918.<br/><br/>
     * protocolVersion: The HTTP POST content starts with a header indicating protocol and version.
     * This contains the protocol-and-version string to be used in the header. Default is MuniRPCv2:.
     * Note: this is a private property and cannot be changed<br/><br/>
     * attribute: A header can also contain an optional comma separated list of value-attribute pairs.<br/>
     * attribute.vendor (string): The 'vendor' attribute is a string containing the assigned vendor name. A vendor field is required.<br/>
     * attribute.hash (boolean): The 'hash' attribute is the MD5 hash of the shared secret concatenated with the contents of the full
     * HTTP POST, including the header without a hash attribute. This value is required when using security level 3 or 4.
     * For this attribute a boolean should be given; true to hash the payload and false for not.<br/>
     * attribute.secret (string): The 'secret' attributes is the clear-text shared secret. This value is required for security level 2.<br/>
     * attribute.time (string): The 'time' attribute indicates a time request. This attribute does not need a attribute-value separator or a value.
     * The reply messages will include a time reply. This time attribute works .
     *
     * @property JOA.header
     * @type {Object}
     */
    var header = {
        attribute: {
            vendor: null,
            hash: null,
            secret: null,
            time: null
        },
        gatewayIdentifier: null
    }, protocolVersion = "MuniRPCv2:";
    /**
     * A counter to be used for message id's. <br/>
     *
     * @property JOA.messageId
     * @type {Integer}
     */
    var messageId = 0;
    /**
     * An object to be used as an enumerator for message types. <br/>
     *
     * @property JOA.messageType
     * @type {Object}
     */
    var messageType = {
        ZCLReport: 0,
        ZCLMultiReport: 1,
        ZCLCommand: 2,
        TAZFrame: 3,
        TimeIndication: "t"
    };
    /**
     * A queue (array) containing all message objects.<br/>
     *
     * @property JOA.messages
     * @type {Array}
     */
    var messages = [];
    /**
     * JOA is an object used to communicate with the backoffice of Munisense. 
     * This object will be able to construct a (syntactically) valid payload according to the ms-tech-141003-3 specification.
     * This implementation only supports the MuniRPC version 2 protocol (JOA3).<br/>
     * There is no need to new this object as that is being done for you. Usage is through the JOA() object.
     * Note: all requests made to the backoffice are made asynchronously.
     *
     * @class JOA
     * @constructor
     * @param {String} [url] an optional parameter used to set the backoffice url.
     * @return {JOA} An object that can be used to communicate to the backoffice.
     * @example 
     JOA("https://www.google.com") initialises the JOA object with Google as the backoffice url;
    **/
    var JOA = function(url) {
        JOA.url = url;
        return this;
    };
    /**
     * Sets the url for the backoffice. <br />
     *
     * @method JOA.setUrl
     * @param {String} [url] the url where the backoffice is located.
    **/
    function setUrl(url) {
        JOA.url = url;
    }
    /**
     * Intialises the header fields in one go with an options object.<br/>
     *
     * @param {Object} [obj] options object containing all headers to be set.
     * @method JOA.headers
     * @example 
     JOA({
        attribute: {
            vendor: "jwz",
            time: "time"
        },
        gatewayIdentifier: "0.0.0.0",
        protocolVersion: "MuniRPCv2:"
    })
    **/
    function headers(obj) {
        JOA.header = obj;
    }
    /**
     * Tries to construct a valid header for the current message. <br />
     * Note: valid, in this context, means that all required fields are set and the result 
     * header string is constructed according to the specification, no validation is done
     * on the values of the header fields, the user is responsible for correct values.
     *
     * @param {Function} [cb] a callback function with an error and a result parameter.
     * @method JOA.constructHeader
    **/
    function constructHeader(cb) {
        var headerStr = "";
        var headerAttributeKeys = Object.keys(header.attribute);
        //gatewayIdentifier cannot be null if it is we fail to construct the header
        if(JOA.header.gatewayIdentifier !== null && JOA.header.gatewayIdentifier.length > 0) {
            //add the protocol and version indication to the header string
            headerStr += protocolVersion;
            //add the gatewayIdentifier
            headerStr += JOA.header.gatewayIdentifier;
            //loop through the attribute object and decide for each key if it has a value, if so we add
            //it to the header string
            for(var i = 0; i < headerAttributeKeys.length; i++) {
                var attributeKey = headerAttributeKeys[i];
                var attributeValue = JOA.header.attribute[attributeKey];
                //this if statement looks complicated, but it is not... the left part of this OR
                //statement will check is de value is not null (default) and if so its length is
                //greater than 0, now some of the header fields can also contain a boolean value
                //instead of only a string value. So the right part of the or statement will check
                //for that if we find a boolean value AND it is true we will concatenate it to the
                //header string
                if((attributeValue !== null && attributeValue.length > 0) || attributeValue) {
                    //if statement for the time header field, if time is set we omit the = char
                    if(attributeKey == "time") {
                        headerStr += ",time";
                    //any other field except for the pre-shared secret and the hash gets added to the
                    //header definition, note: the hash (if enabled) will be added later on
                    //in constructJOAPayload() function.
                    } else if(attributeKey !== "secret" && attributeKey !== "hash") {
                        headerStr += "," + attributeKey + "=" + attributeValue;
                    }
                }
            }
            //at last we're going to add a LF character to mark the header as complete
            headerStr += char.eol;
            //the final check is checking or the final string has a "vendor=" substring in it
            //the vendor header attribute is mandatory
            if(headerStr.indexOf("vendor=") !== -1) {
                //callback with the result, all went well and we constructed a valid header
                cb(null, headerStr);
            } else {
                //no vendor attribute set
                cb("no_vendor_attribute_set", null);
            }
        } else {
            cb("no_gatewayidentifier_set", null);
        }
    }
    /**
     * Will convert all message objects in the queue to a syntactically correct JOA message. <br/>
     *
     * @method JOA.constructMessages
     * @return {Array} An array consisting of all converted JOA messages.
     */
    function constructMessages() {
        //setup an temp array which will hold all the new converted messages
        var tmp = [];
        //loop through all the messages
        for(var i = 0; i < messages.length; i++) {
            var convertedMessage = "";
            var message = messages[i];
            //since every message can vary in number of field we need the number of keys in each object
            var messageKeys = Object.keys(message);
            //for each message key add it to the converted message
            for(var j = 0; j < messageKeys.length; j++) {
                convertedMessage += message[messageKeys[j]] + char.tab;
            }
            //cut off the last tab char and instead add a eol char
            convertedMessage = convertedMessage.slice(0, -1) + char.eol;
            //add it to the temp array
            tmp.push(convertedMessage);
        }
        //return the results
        return tmp;
    }
    /**
     * Adds a ZCL report to the message queue. <br/>
     *
     * @method JOA.addZCLReport
     * @param {String} [eui64] a 64bits address defined as an IEEE standard.
     * @param {String} [endpointId] when a single message device has multiple sensors of the same type, the endpointId
     * can be used to enumerate the sensors. The range of allowed values is 1 to 239. The best value to use when only
     * a single endpoint is used on a device is: 10 (0x0a). This field is also optional and when null is supplied 
     * 0x0a will be used.
     * @param {String} [profileId] an optional ZigBee specific field, if null is supplied the default 0xf100 will be used.
     * @param {String} [clusterId] clusters are an organizational unit of attributes of the same type. For example,
     * all temperature related attributes are defined in clusterid: 1026 (0x0402). All cluster id's must be coordinated
     * with Munisense before usage.
     * @param {String} [attributeId] attributes are the most specific fields defining a message. For example, the
     * calibration value in the temperature cluster has an attributeid of 5 (0x005), has a unit in C (celsius) and has
     * a data type int16s (0x29) and is presumed to be delivered with a scale factor of 0.01. Lists of definition are
     * available from ZigBee specifications or vendor specific clusters can be defined coordinated with Munisense.
     * @param {String} [dataTypeId] each attribute has a fixed data type. Sending this value is an indication how values
     * submitted should be handled and must be consistent throughout the implementation. Data types are defined in the
     * ZigBee specification.
     * @param {String} [timestamp] the timestamp is used to indicate the occurreence of a message. This value is a
     * positive numerical value up to 48 bits in size indicating the number of milliseconds since 1970-01-01 00:00:00
     * UTC, not adjusting for daylight savings time or leap seconds.
     * @param {String} [value] the value is an ASCII representation of the reported value. The datatypeId indicates how
     * a value should be notated:<br />
     * - Integer(0x20-0x27, 0x28-0x2f): The value is numeriv and optionally negative using a '-' minues
     * indication in front of the value for signed values.<br />
     * - Floating point (0x38-0x3a): Values are numeric, separating the integral and fractional parts with a '.' dot.<br />
     * - Character/octet string (0x41-0x44): Value starting with one or two bytes indicating the length of the field
     * completely encoded with base64.<br />
     * - Boolean (0x10): 0 for false, 1 for true.<br />
     * - Time (0xe2): This value is a positive numerical value up to 32bits in size indidcating the number of milliseconds
     * since 2000-01-01 00:00:00 UTC, not adjusting for daylight savings time or leap seconds.<br />
     * - Enumerations (0x30-0x31): Numeric value indicating an enumeration.
     * @return {Object} the inserted report.
     */
    function addZCLReport(eui64, endpointId, profileId, clusterId, attributeId, dataTypeId, timestamp, value) {
        var obj = {
            id: generateId(),
            messageType: messageType.ZCLReport,
            eui64: eui64,
            endpointId: endpointId || "0x0a",
            profileId: profileId || "0xf100",
            clusterId: clusterId,
            attributeId: attributeId,
            dataTypeId: dataTypeId,
            timestamp: timestamp,
            value: value
        };
        messages.push(obj);
        return obj;
    }
    /**
     * Adds a ZCL Multi report to the message queue. <br/>
     *
     * @method JOA.addZCLMultiReport
     * @param {String} [eui64] a 64bits address defined as an IEEE standard.
     * @param {String} [endpointId] when a single message device has multiple sensors of the same type, the endpointId
     * can be used to enumerate the sensors. The range of allowed values is 1 to 239. The best value to use when only
     * a single endpoint is used on a device is: 10 (0x0a). This field is also optional and when null is supplied 
     * 0x0a will be used.
     * @param {String} [profileId] an optional ZigBee specific field, if null is supplied the default 0xf100 will be used.
     * @param {String} [clusterId] clusters are an organizational unit of attributes of the same type. For example,
     * all temperature related attributes are defined in clusterid: 1026 (0x0402). All cluster id's must be coordinated
     * with Munisense before usage.
     * @param {String} [attributeId] attributes are the most specific fields defining a message. For example, the
     * calibration value in the temperature cluster has an attributeid of 5 (0x005), has a unit in C (celsius) and has
     * a data type int16s (0x29) and is presumed to be delivered with a scale factor of 0.01. Lists of definition are
     * available from ZigBee specifications or vendor specific clusters can be defined coordinated with Munisense.
     * @param {String} [dataTypeId] each attribute has a fixed data type. Sending this value is an indication how values
     * submitted should be handled and must be consistent throughout the implementation. Data types are defined in the
     * ZigBee specification.
     * @param {String} [timestamp] the timestamp is used to indicate the occurreence of a message. This value is a
     * positive numerical value up to 48 bits in size indicating the number of milliseconds since 1970-01-01 00:00:00
     * UTC, not adjusting for daylight savings time or leap seconds.
     * @param {String} [values] an array containing the values in an ASCII representation of the reported values.
     * The datatypeId indicates how a value should be notated:<br />
     * - Integer(0x20-0x27, 0x28-0x2f): The value is numeriv and optionally negative using a '-' minues
     * indication in front of the value for signed values.<br />
     * - Floating point (0x38-0x3a): Values are numeric, separating the integral and fractional parts with a '.' dot.<br />
     * - Character/octet string (0x41-0x44): Value starting with one or two bytes indicating the length of the field
     * completely encoded with base64.<br />
     * - Boolean (0x10): 0 for false, 1 for true.<br />
     * - Time (0xe2): This value is a positive numerical value up to 32bits in size indidcating the number of milliseconds
     * since 2000-01-01 00:00:00 UTC, not adjusting for daylight savings time or leap seconds.<br />
     * - Enumerations (0x30-0x31): Numeric value indicating an enumeration.
     * @return {Object} the inserted report.
     */
    function addZCLMultiReport(eui64, endpointId, profileId, clusterId, attributeId, dataTypeId, timestamp, offset, values) {
        var obj = {
            id: generateId(),
            messageType: messageType.ZCLMultiReport,
            eui64: eui64,
            endpointId: endpointId || "0x0a",
            profileId: profileId || "0xf100",
            clusterId: clusterId,
            attributeId: attributeId,
            dataTypeId: dataTypeId,
            timestamp: timestamp,
            offset: offset,
            values: values
        };
        messages.push(obj);
        return obj;
    }
    /**
     * Adds a ZCL command to the message queue. <br/>
     *
     * @method JOA.addZCLCommand
     * @param {String} [eui64] a 64bits address defined as an IEEE standard.
     * @param {String} [endpointId] when a single message device has multiple sensors of the same type, the endpointId
     * can be used to enumerate the sensors. The range of allowed values is 1 to 239. The best value to use when only
     * a single endpoint is used on a device is: 10 (0x0a). This field is also optional and when null is supplied 
     * 0x0a will be used.
     * @param {String} [profileId] an optional ZigBee specific field, if null is supplied the default 0xf100 will be used.
     * @param {String} [clusterId] clusters are an organizational unit of attributes of the same type. For example,
     * all temperature related attributes are defined in clusterid: 1026 (0x0402). All cluster id's must be coordinated
     * with Munisense before usage.
     * @param {String} [isClusterSpecific] attributes are the most specific fields defining a message. For example, the
     * calibration value in the temperature cluster has an attributeid of 5 (0x005), has a unit in C (celsius) and has
     * a data type int16s (0x29) and is presumed to be delivered with a scale factor of 0.01. Lists of definition are
     * available from ZigBee specifications or vendor specific clusters can be defined coordinated with Munisense.
     * @param {String} [commandId] each attribute has a fixed data type. Sending this value is an indication how values
     * submitted should be handled and must be consistent throughout the implementation. Data types are defined in the
     * ZigBee specification.
     * @param {String} [timestamp] the timestamp is used to indicate the occurreence of a message. This value is a
     * positive numerical value up to 48 bits in size indicating the number of milliseconds since 1970-01-01 00:00:00
     * UTC, not adjusting for daylight savings time or leap seconds.
     * @param {String} [value] the value in an ASCII representation of the reporte values.
     * @return {Object} the inserted report.
     */
    function addZCLCommand(eui64, endpointId, profileId, clusterId, isClusterSpecific, commandId, timestamp, value) {
        var obj = {
            id: generateId(),
            messageType: messageType.ZCLCommand,
            eui64: eui64,
            endpointId: endpointId || "0x0a",
            profileId: profileId || "0xf100",
            clusterId: clusterId,
            isClusterSpecific: isClusterSpecific,
            commandId: commandId,
            timestamp: timestamp,
            offset: offset,
            value: value
        };
        messages.push(obj);
        return obj;
    }
    /**
     * Adds a Time to the message queue. <br/>
     *
     * @method JOA.addTime
     * @param {String} [timestamp] the timestamp to add to the queue.
     * @return {Object} the inserted report.
     */
    function addTime(timestamp) {
        var obj = {
            id: generateId(),
            messageType: messageType.TimeIndication,
            timestamp: timestamp
        };
        messages.push(obj);
        return obj;
    }
    /**
     * Clears all inserted messages. This function will also be invoked when a successful post call was made. <br/>
     *
     * @method JOA.clearMessages
     */
    function clearMessages() {
        messages = [];
    }
    /**
     * Removes a sinlge message from the queue. <br/>
     *
     * @method JOA.removeMessage
     * @return {Boolean} true if a message was removed, false otherwise.
     */
    function removeMessage(id) {
        for(var i = 0; i < messages.length; i++) {
            if(messages[i].id === id) {
                var obj = messages[i];
                messages.splice(i, 1);
                return true;
            }
        }
        return false;
    }
    /**
     * Generates an unique id for this particular instance of JOA. These id's will be used for messages.
     * An id is a 32bit unsigned integer that is being kept track of and incremented each time this function is called. 
     * This process is as suggested by the JOA specification.<br/>
     *
     * @method JOA.generateId
     * @return {Integer} An incremented value to be used as an id, unique for this current instance of JOA.
     */
    function generateId() {
        messageId++;
        return messageId;
    }
    /**
     * Will construct a syntactically valid JOA payload. If hash is set to true in the header attributes
     * it will generate a hash too. <br/>
     *
     * @param {Function} [cb] a callback function with an error and a result parameter.
     * @method JOA.constructJOAPayload
     */
    function constructJOAPayload(cb) {
        constructHeader(function(err, result) {
            if(err) {
                cb(err, null);
            } else {
                //if hash is disabled we will not hash the payload
                if(!JOA.header.attribute.hash) {
                    cb(null, result + constructMessages());
                //else if the hash is enabled AND the secret is also set we will hash the payload
                } else if(JOA.header.attribute.hash &&
                          JOA.header.attribute.secret &&
                          JOA.header.attribute.secret.length > 0) {
                    cb(null, hashJOAPayload(result + constructMessages()));
                //in any other cases (which is only when the hash is enabled and no secret is set)
                //we will return an error
                } else {
                    cb("no_secret_set", null);
                }
            }
        });
    }
    /**
     * Hashes the entire JOA payload with the secret set in the header. <br/>
     *
     * @method JOA.hashJOAPayload
     */
    function hashJOAPayload(payload) {
        //we get the first occurence of the eol in the header definition and there
        //we will insert the generated hash header
        var indexOfHashHeader = payload.indexOf(char.eol);
        //return the new payload with the appended hash header
        console.log(JSON.stringify(JOA.header.attribute.secret + payload));
        console.log(JOA.header.attribute.secret + payload);
        console.log(JOA.md5("waiga6ieGo4eefo2thaQuash4ahc4aidMuniRPCv2:10.32.16.1,vendor=androidnode,time\n1\t0\t\t0x0a\t0xf100\n"));
        return payload.slice(0, indexOfHashHeader) + ",hash=" + JOA.md5(JOA.header.attribute.secret + payload) + payload.slice(indexOfHashHeader);
    }
    /**
     * Posts a constructed JOA payload to the backoffice of Munisense. 
     * Will clear the message queue and return the results as reported by the backoffice upon a
     * succcessful post. 
     * Note: CORS headers should be enabled on the requested resource.<br/>
     *
     * @method JOA.post
     * @param {Function} [cb] a function used to call back to whenever the HTTP post finishes.
     */
    function post(cb) {
        constructJOAPayload(function(err, result) {
            if(err) {
                cb(err, null);
            } else {
                //make ajax call
                var http = new XMLHttpRequest();
                var params = result;
                http.open("POST", JOA.url, true);
                //call a function when the state changes
                http.onreadystatechange = function() {
                    if(http.readyState == XMLHttpRequest.DONE) {
                        if(http.status == 200) {
                            //if all went well clear the messages and make a callback
                            clearMessages();
                            cb(null, http.responseText);
                        } else {
                            cb(http.statusText, null);
                        }
                    }
                };
                http.send(params);
            }
        });
    }
    /**
     * A representation of the object in the format of a composed JOA payload (see also 'Example'
     * in the JOA specification document). 
     * It could also contain errors, if, for example, the header couldn't be contructed this
     * toString() function will output the error message instead of the payload.<br />
     *
     * @method JOA.toString
     * @return {String} A string based representation of a composed JOA payload.
    **/
    function toString() {
        var ret = null;
        constructJOAPayload(function(err, result) {
            if(err) {
                ret = err;
            } else {
                ret = result;
            }
        });
        return ret;
    }
    /**
     * A minized natively approach for Javascript md5 hashing.<br />
     *
     * @method JOA.md5
     * @param {String} [s] any string to be hashed.
     * @return {String} A md5 hashed string.
    **/
    var md5 = function(s){function L(k,d){return(k<<d)|(k>>>(32-d));}function K(G,k){var I,d,F,H,x;F=(G&2147483648);H=(k&2147483648);I=(G&1073741824);d=(k&1073741824);x=(G&1073741823)+(k&1073741823);if(I&d){return(x^2147483648^F^H);}if(I|d){if(x&1073741824){return(x^3221225472^F^H);}else{return(x^1073741824^F^H);}}else{return(x^F^H);}}function r(d,F,k){return(d&F)|((~d)&k);}function q(d,F,k){return(d&k)|(F&(~k));}function p(d,F,k){return(d^F^k);}function n(d,F,k){return(F^(d|(~k)));}function u(G,F,aa,Z,k,H,I){G=K(G,K(K(r(F,aa,Z),k),I));return K(L(G,H),F);}function f(G,F,aa,Z,k,H,I){G=K(G,K(K(q(F,aa,Z),k),I));return K(L(G,H),F);}function D(G,F,aa,Z,k,H,I){G=K(G,K(K(p(F,aa,Z),k),I));return K(L(G,H),F);}function t(G,F,aa,Z,k,H,I){G=K(G,K(K(n(F,aa,Z),k),I));return K(L(G,H),F);}function e(G){var Z;var F=G.length;var x=F+8;var k=(x-(x%64))/64;var I=(k+1)*16;var aa=Array(I-1);var d=0;var H=0;while(H<F){Z=(H-(H%4))/4;d=(H%4)*8;aa[Z]=(aa[Z]| (G.charCodeAt(H)<<d));H++;}Z=(H-(H%4))/4;d=(H%4)*8;aa[Z]=aa[Z]|(128<<d);aa[I-2]=F<<3;aa[I-1]=F>>>29;return aa;}function B(x){var k="",F="",G,d;for(d=0;d<=3;d++){G=(x>>>(d*8))&255;F="0"+G.toString(16);k=k+F.substr(F.length-2,2);}return k;}function J(k){k=k.replace(/rn/g,"n");var d="";for(var F=0;F<k.length;F++){var x=k.charCodeAt(F);if(x<128){d+=String.fromCharCode(x);}else{if((x>127)&&(x<2048)){d+=String.fromCharCode((x>>6)|192);d+=String.fromCharCode((x&63)|128);}else{d+=String.fromCharCode((x>>12)|224);d+=String.fromCharCode(((x>>6)&63)|128);d+=String.fromCharCode((x&63)|128);}}}return d;}var C=Array();var P,h,E,v,g,Y,X,W,V;var S=7,Q=12,N=17,M=22;var A=5,z=9,y=14,w=20;var o=4,m=11,l=16,j=23;var U=6,T=10,R=15,O=21;s=J(s);C=e(s);Y=1732584193;X=4023233417;W=2562383102;V=271733878;for(P=0;P<C.length;P+=16){h=Y;E=X;v=W;g=V;Y=u(Y,X,W,V,C[P+0],S,3614090360);V=u(V,Y,X,W,C[P+1],Q,3905402710);W=u(W,V,Y,X,C[P+2],N,606105819);X=u(X,W,V,Y,C[P+3],M,3250441966);Y=u(Y,X,W,V,C[P+4],S,4118548399);V=u(V,Y,X,W,C[P+5],Q,1200080426);W=u(W,V,Y,X,C[P+6],N,2821735955);X=u(X,W,V,Y,C[P+7],M,4249261313);Y=u(Y,X,W,V,C[P+8],S,1770035416);V=u(V,Y,X,W,C[P+9],Q,2336552879);W=u(W,V,Y,X,C[P+10],N,4294925233);X=u(X,W,V,Y,C[P+11],M,2304563134);Y=u(Y,X,W,V,C[P+12],S,1804603682);V=u(V,Y,X,W,C[P+13],Q,4254626195);W=u(W,V,Y,X,C[P+14],N,2792965006);X=u(X,W,V,Y,C[P+15],M,1236535329);Y=f(Y,X,W,V,C[P+1],A,4129170786);V=f(V,Y,X,W,C[P+6],z,3225465664);W=f(W,V,Y,X,C[P+11],y,643717713);X=f(X,W,V,Y,C[P+0],w,3921069994);Y=f(Y,X,W,V,C[P+5],A,3593408605);V=f(V,Y,X,W,C[P+10],z,38016083);W=f(W,V,Y,X,C[P+15],y,3634488961);X=f(X,W,V,Y,C[P+4],w,3889429448);Y=f(Y,X,W,V,C[P+9],A,568446438);V=f(V,Y,X,W,C[P+14],z,3275163606);W=f(W,V,Y,X,C[P+3],y,4107603335);X=f(X,W,V,Y,C[P+8],w,1163531501);Y=f(Y,X,W,V,C[P+13],A,2850285829);V=f(V,Y,X,W,C[P+2],z,4243563512);W=f(W,V,Y,X,C[P+7],y,1735328473);X=f(X,W,V,Y,C[P+12],w,2368359562);Y=D(Y,X,W,V,C[P+5],o,4294588738);V=D(V,Y,X,W,C[P+8],m,2272392833);W=D(W,V,Y,X,C[P+11],l,1839030562);X=D(X,W,V,Y,C[P+14],j,4259657740);Y=D(Y,X,W,V,C[P+1],o,2763975236);V=D(V,Y,X,W,C[P+4],m,1272893353);W=D(W,V,Y,X,C[P+7],l,4139469664);X=D(X,W,V,Y,C[P+10],j,3200236656);Y=D(Y,X,W,V,C[P+13],o,681279174);V=D(V,Y,X,W,C[P+0],m,3936430074);W=D(W,V,Y,X,C[P+3],l,3572445317);X=D(X,W,V,Y,C[P+6],j,76029189);Y=D(Y,X,W,V,C[P+9],o,3654602809);V=D(V,Y,X,W,C[P+12],m,3873151461);W=D(W,V,Y,X,C[P+15],l,530742520);X=D(X,W,V,Y,C[P+2],j,3299628645);Y=t(Y,X,W,V,C[P+0],U,4096336452);V=t(V,Y,X,W,C[P+7],T,1126891415);W=t(W,V,Y,X,C[P+14],R,2878612391);X=t(X,W,V,Y,C[P+5],O,4237533241);Y=t(Y,X,W,V,C[P+12],U,1700485571);V=t(V,Y,X,W,C[P+3],T,2399980690);W=t(W,V,Y,X,C[P+10],R,4293915773);X=t(X,W,V,Y,C[P+1],O,2240044497);Y=t(Y,X,W,V,C[P+8],U,1873313359);V=t(V,Y,X,W,C[P+15],T,4264355552);W=t(W,V,Y,X,C[P+6],R,2734768916);X=t(X,W,V,Y,C[P+13],O,1309151649);Y=t(Y,X,W,V,C[P+4],U,4149444226);V=t(V,Y,X,W,C[P+11],T,3174756917);W=t(W,V,Y,X,C[P+2],R,718787259);X=t(X,W,V,Y,C[P+9],O,3951481745);Y=K(Y,h);X=K(X,E);W=K(W,v);V=K(V,g);}var i=B(Y)+B(X)+B(W)+B(V);return i.toLowerCase();};
    
    //JOA properties
    JOA.url = url;
    JOA.header = header;
    //JOA constructor
    JOA.prototype.constructor = JOA;
    //JOA methods
    JOA.headers = headers;
    JOA.setUrl = setUrl;
    JOA.addZCLReport = addZCLReport;
    JOA.clearMessages = clearMessages;
    JOA.removeMessage = removeMessage;
    JOA.post = post;
    JOA.toString = toString;
    JOA.md5 = md5;
    
    //debug to be removed
    JOA.debug = "";
    
    return JOA;
}());

// Adds npm support
if (typeof exports !== 'undefined') {
    if (typeof module !== 'undefined' && module.exports) {
        exports = module.exports = JOA;
    }
    exports.JOA = JOA;
} else {
    this.JOA = JOA;
}