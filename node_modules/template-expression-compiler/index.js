'use strict';
var parser = require('./ExpressionParser');

// See https://github.com/gwicke/tassembly#model-access-and-expressions
var ctxMap = {
    '$': 'rm', // Normally rc.g, but this works better for RESTBase
    '$data': 'm',
    '$root': 'rm',
    '$parent': 'pm',
    '$parents': 'pms',
    '$parentContext': 'pc',
    '$index': 'i',
    '$context': 'c',
    '$rawData': 'd',
    // RESTBase specific mappings
    '$$': 'rc.g',
};

function makeCtxMatcher(map) {
    var reSrc = '^\\.(?:' + Object.keys(map)
            .map(function(item) {
                return item.replace(/\$/g, '\\$');
            })
            .join('|') + ')$';
    var re = new RegExp(reSrc);
    return re.exec.bind(re);
}

function stringifyObject (obj) {
    if (obj === null) {
        return obj;
    } else if (Array.isArray(obj)) {
        return '[' + obj.map(function(elem) {
            return stringifyObject(elem);
        }).join(',') + ']';
    } else if (obj.constructor === Object) {
        var res = '{',
            keys = Object.keys(obj);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            if (obj[key] === undefined || obj[key] === null) {
                continue;
            }
            if (i !== 0) {
                res += ',';
            }
            if (/^[a-z_$][a-z0-9_$]*$/.test(key)) {
                res += key + ':';
            } else {
                res += "'" + key.replace(/'/g, "\\'") + "':";
            }
            res += stringifyObject(obj[key]);
        }
        res += '}';
        return res;
    } else if (obj.constructor === Number) {
        return obj;
    } else {
        return obj.toString();
    }
}

function stringifyChildObjects (obj) {
    for (var key in obj) {
        var child = obj[key];
        if (child && child.constructor === Object) {
            obj[key] = stringifyObject(child);
        }
    }
    return obj;
}

var defaultOptions = {
    ctxMap: ctxMap,
    stringifyObject: stringifyObject
};

function parse(input, options) {
    options = options || defaultOptions;
    if (!options.ctxMap) { options.ctxMap = defaultOptions.ctxMap; }
    if (!options.stringifyObject) {
        options.stringifyObject = defaultOptions.stringifyObject;
    }

    // Add some internal properties to options
    options._ctxMatcher = makeCtxMatcher(options.ctxMap);

    // Only parse expressions, not key-value pairs
    options.startRule = 'expression';
    try {
        if (typeof input === 'string') {
            return stringifyObject(parser.parse(input, options));
        } else {
            return stringifyObject(parser.parse(stringifyObject(input), options));
        }
    } catch (e) {
        e.expression = input;
        e.options = options;
        throw e;
    }
}


module.exports = {
    parse: parse,
    stringify: stringifyObject,
};

