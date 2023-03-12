var assert = require('assert');
var parser = require('../index.js');

// Notes
// - goal: compile to one big object literal
// - need to parse {placeholder}s
// - need self-executing function or expression for each value

var testCases = [
{
    expression: '{a: {A: 2,\n b: $parentContext.$data.foo[4].bar({\n"fo\'o":\nbar[3]}) .baz }}',
    tassembly: "{a:{'A':2,b:pc.m.foo[4].bar({'fo\\'o':m.bar[3]}).baz}}",
},
{
    expression: "{res:$data.foo-bar.baz,foo:'bar'}",
    tassembly: "{res:m['foo-bar'].baz,foo:'bar'}",
},
{
    expression: '$.request.headers.content-type',
    tassembly: "rm.request.headers['content-type']",
},
{
    expression: {headers:{'content-type': '$.request.headers.content-type'}},
    tassembly: "{headers:{'content-type':rm.request.headers['content-type']}}",
},
{
    expression: {headers:{"content-type": "$$.default($.request.headers.content-type,'text/html')"}},
    tassembly: "{headers:{'content-type':rc.g.default(rm.request.headers['content-type'],'text/html')}}",
},
{
    expression: {headers:{"content-type": "$$.default($.request.headers.content-type,'text/html')"}, body: undefined},
    tassembly: "{headers:{'content-type':rc.g.default(rm.request.headers['content-type'],'text/html')}}",
},
{
    name: 'Call a function from the model',
    expression: "default($.request.headers.content-type,'text/html')",
    tassembly: "m.default(rm.request.headers['content-type'],'text/html')",
},
{
    name: 'Call a function from the model, complex default value',
    expression: "default($.request.headers,{content-type: 'text/html', x-forwarded-for: $.request.headers.x-forwarded-for})",
    tassembly: "m.default(rm.request.headers,{'content-type':'text/html','x-forwarded-for':rm.request.headers['x-forwarded-for']})",
},
{
    name: 'Array support',
    expression: {array: [ 'foo', 'bar', "'baz'" ] },
    tassembly: "{array:[m.foo,m.bar,'baz']}",
},
{
    name: 'Numbers',
    expression: {array: [ 'foo', 5, "'baz'" ] },
    tassembly: "{array:[m.foo,5,'baz']}",
},
];

function runCase(testCase, options) {
    assert.equal(parser.parse(testCase.expression, options), testCase.tassembly);
}
var cases = {};
testCases.forEach(function(tc) {
    var i = !cases[tc.name] && tc.name || tc.tassembly;
    cases[i] = function() {
        return runCase(tc);
    };
});


/**
 * RESTBase specific tests
 */

var restBaseCases = [
    {
        name: 'Dotted path & call prefixes',
        expression: 'foo(some.path, modelAccess)',
        tassembly: 'rc.g.foo(rm.some.path,m.modelAccess)',
    },
    {
        name: 'Deep call',
        expression: 'some.foo(bar(some.foo(baz())))',
        tassembly: 'rm.some.foo(rc.g.bar(rm.some.foo(rc.g.baz())))',
    },
    {
        name: 'Spaces',
        expression: ' some.foo( bar( some.foo( baz( ) ) ) ) ',
        tassembly: 'rm.some.foo(rc.g.bar(rm.some.foo(rc.g.baz())))',
    },
    {
        name: 'Bracket path & call',
        expression: 'some[bar].foo()',
        tassembly: 'rm.some[m.bar].foo()',
    },
    {
        name: 'Simple call',
        expression: 'foo()',
        tassembly: 'rc.g.foo()',
    },
    {
        name: 'Simple call plus dotted path',
        expression: 'foo().bar.baz',
        tassembly: 'rc.g.foo().bar.baz',
    },
    {
        name: 'Not a dotted path',
        expression: 'foo-bar',
        tassembly: "m['foo-bar']",
    },
    {
        name: 'Empty object',
        expression: '{}',
        tassembly: "{}",
    },
    {
        name: 'Empty object with spaces',
        expression: '{  }',
        tassembly: "{}",
    },
];

var restBaseOptions = {
    ctxMap: {
        global: 'rm',
        '$context': 'c',
    },
    dottedPathPrefix: 'rm',
    callPrefix: 'rc.g',
    modelPrefix: 'm',
};

var rbCases = {};
restBaseCases.forEach(function(tc) {
    var i = !rbCases[tc.name] && tc.name || tc.tassembly;
    rbCases[i] = function() {
        return runCase(tc, restBaseOptions);
    };
});

module.exports = {
    Parsing: cases,
    RESTBase: rbCases,
};
