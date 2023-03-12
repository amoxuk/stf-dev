TAssembly
=========

JSON
[IR](https://en.wikipedia.org/wiki/Intermediate_language#Intermediate_representation)
for templating and corresponding runtime implementation

**"Fast but safe"**

Security guarantees of DOM-based templating (tag balancing, context-sensitive
href/src/style sanitization etc) with the performance of string-based templating.

See
 [this page for background.](https://www.mediawiki.org/wiki/Requests_for_comment/HTML_templating_library/Knockout_-_Tassembly)

* The JSON format is compact, can easily be persisted and can be evaluated with
a tiny library.

* Performance is on par with compiled handlebars templates, the fastest
string-based library in our tests.

* Compilation target for [Knockoff templates
  (KnockoutJS syntax)](https://github.com/gwicke/knockoff) and
  [Spacebars](https://github.com/gwicke/TemplatePerf/tree/master/handlebars-htmljs-node/spacebars-qt).

Usage
=====
```javascript
var ta = require('tassembly');

// compile a template
var tplFun = ta.compile(['<div',['attr',{id:"m.id"}],'>',['text','m.body'],'</div>']);
// call with a model
var html = tplFun({id: 'some id', body: 'The body text'});
```

TAssembly also supports compilation options. 
```javascript
var options = {
    globals: {
        echo: function(x) {
            return x;
        }
    },
    partials: {
        'user': ['<li>'['text','m.userName','</li>']
    }
};

var tpl = ['<ul>',['attr',{id:"rc.g.echo(m.id)"}],'>',
            ['foreach',{data:'m.users',tpl:'user'}],
            '</ul>'],
    // compile the template
    tplFun = ta.compile(tpl, options);

// call with a model
var model = {
    id: 'some id',
    users: [
        {
            userName: 'Paul'
        }
    ]
};
var html = tplFun(model);
```

Optionally, you can also override options at render time:

```javascript
var html = tplFun(model, options);
```

TAssembly spec
==============
TAssembly examples:

```javascript
['<div',['attr',{id:'m.id'}],'>',['text','m.body'],'</div>']

['<div',['attr',{id:'m.id'}],'>',
      ['foreach',{data:'m.items',tpl:['<div',['attr',{id:'m.key'}],'>',['text','m.val'],'</div>']}],
'</div>']
```
* String content is represented as plain strings
* Opcodes are represented as a two-element array of the form [opcode, options]
* Expressions can be used to access the model, parent scopes, globals and so
  on. Supported are number & string literals, variable references, function
  calls and array dereferences. The compiler used to generate TAssembly is
  expected to validate expressions. See the section detailing the model access
  options and expression format below for further detail.

### raw
Emit a raw object reference. Options is a single expression:
```javascript
['raw','m.rawContent']
```

### text
Emit text content. HTML-sensitive chars are escaped. Options is a single
expression:
```javascript
['text','m.textContent']
```

### foreach
Iterate over an array. The view model 'm' in each iteration is each member of the
array.
```javascript
[
    "foreach",
    {
        "data": "m.items",
        "tpl": ["<span>",["text","m.key"],"</span>"]
    }
]
```
You can pass in the name of a partial instead of the inline template.

The iteration counter is available as context variable / expression 'i'.

### template
Calls a template (inline or name of a partial) with a given model.
```javascript
['template', { 
    data: 'm.modelExpression', 
    tpl: ['<span>',['text','m.body'],'</span>']
}]
```

### with
Calls a template (inline or name of a partial) with a given model, only if
that model is truish.
```javascript
['with', { 
    data: 'm.modelExpression', 
    tpl: ['<span>',['text','m.body'],'</span>']
}]
```
### if
Calls a template (inline or name of a partial) if a condition is true.
```javascript
['if', { 
    data: 'm.conditionExpression', 
    tpl: ['<span>',['text','m.body'],'</span>']
}]
```
### ifnot
Calls a template (inline or name of a partial) if a condition is false.
```javascript
['if', { 
    data: 'm.conditionExpression', 
    tpl: ['<span>',['text','m.body'],'</span>']
}]
```
### attr
Emit one or more HTML attributes. Automatic context-sensitive escaping is
applied to href, src and style attributes. 

Options is an object of attribute name -> value pairs:
```javascript
{ id: "m.idAttrVal", title: "m.titleAttrVal" }
```
Attributes whose value is null are skipped. The value can also be an object:
```javascript
{
    "style": {
        "v": "m.value",
            "app": [
            {
                "ifnot": "m.obj",
                "v": "display: none !important;"
            }
        ]
    }
}
```
In this case, the style attribute will have the values "color:red;" or
"color:red;display:none !important" depending on the value of the variable
'obj' in the current view model.


Model access and expressions
----------------------------
* Literals: 
  * Number "2" or "3.4"
  * String "'Some string literal'" (note single quotes); single quotes escaped
    with "\'" & backslashes escaped as "\\"
  * Object "{foo:'bar',baz:m.someVar}"
* Variable access with dot notation: 'm.foo.bar'
* Array references: "m.users[m.user]"
* Function calls: "rc.g.i18n('username',{foo:m.bar})"; nesting and multiple
  parameters supported

Expressions have access to a handful of variables defined in the current
context:
* m - current view model (Knockout: '$data')
* rm - root (topmost) view model (Knockout: '$root')
* pm - parent view model (Knockout: '$parent')
* pms - array of parent view models (Knockout: '$parents')
* pc - parent context object (Knockout: '$parentContext')
* i - current iteration index in foreach (Knockout: '$index')
* rc - root context object
* rc.g - globals defined at compile time; typically used for helper functions
  which should not be part of the model (i18n etc)
