/*
 * JSON template IR runtime
 *
 * Motto: Fast but safe!
 *
 * A string-based template representation that can be compiled from DOM-based
 * templates (knockoutjs syntax for example) and can statically enforce
 * balancing and contextual sanitization to prevent XSS, for example in href
 * and src attributes. The JSON format is compact, can easily be persisted and
 * can be evaluated with a tiny library (this file).
 *
 * Performance is on par with compiled handlebars templates, the fastest
 * string-based library in our tests.
 *
 * Input examples:
 * ['<div',['attr',{id:'id'}],'>',['text','body'],'</div>']
 * ['<div',['attr',{id:'id'}],'>',
 *	['foreach',{data:'m_items',tpl:['<div',['attr',{id:'key'}],'>',['text','val'],'</div>']}],
 * '</div>']
 */
"use strict";

var attrSanitizer = new (require('./AttributeSanitizer.js').AttributeSanitizer)();

function TAssembly () {
	this.uid = 0;
	// Cache for sub-structure parameters. Storing them globally keyed on uid
	// makes it possible to reuse compilations.
	this.cache = {};
	// Partials: tassembly objects
	this.partials = {};
}

TAssembly.prototype.attrSanitizer = attrSanitizer;

TAssembly.prototype._getUID = function() {
	this.uid++;
	return this.uid;
};

var simpleExpression = /^(?:[.][a-zA-Z_$]+)+$/,
	complexExpression = new RegExp('^(?:[.][a-zA-Z_$]+'
			+ '(?:\\[(?:[0-9.]+|["\'][a-zA-Z0-9_$]+["\'])\\])?'
			+ '(?:\\((?:[0-9a-zA-Z_$.]+|["\'][a-zA-Z0-9_$\\.]+["\'])\\))?'
			+ ')+$'),
	simpleBindingVar = /^(m|p(?:[cm]s?)?|r[mc]|i|c)\.([a-zA-Z_$]+)$/;

// Rewrite an expression so that it is referencing the context where necessary
function rewriteExpression (expr) {
	// Rewrite the expression to be keyed on the context 'c'
	// XXX: experiment with some local var definitions and selective
	// rewriting for perf
	var res = '',
		i = -1,
		c = '';
	do {
		if (/^$|[\[:(,]/.test(c)) {
			res += c;
			if (/[pri]/.test(expr[i+1])
				&& /^(?:p(?:[cm]s?)|r[mc]|i)(?:[\.\(\)}\[\]]|$)/.test(expr.slice(i+1))) {
				// Prefix with full context object; only the local view model
				// 'm' and the context 'c' is defined locally for now
				res += 'c.';
			}
		} else if (c === "'") {
			// skip over string literal
			var literal = expr.slice(i).match(/'((?:[^\\']+|\\+'?)*)'/);
			if (literal) {
				res += JSON.stringify(literal[1].replace(/\\'/g, "'"));
				i += literal[0].length - 1;
			}
		} else {
			res += c;
		}
		i++;
		c = expr[i];
	} while (c);
	return res;
}

TAssembly.prototype._evalExpr = function (expression, ctx) {
	var func = this.cache['expr' + expression];
	if (!func) {

		var simpleMatch = expression.match(simpleBindingVar);
		if (simpleMatch) {
			var ctxMember = simpleMatch[1],
				key = simpleMatch[2];
			return ctx[ctxMember][key];
		}

		// String literal
		if (/^'.*'$/.test(expression)) {
			return expression.slice(1,-1).replace(/\\'/g, "'");
		}

		func = new Function('c', 'var m = c.m;'
				+ 'return ' + rewriteExpression(expression));
		this.cache['expr' + expression] = func;
	}
	if (func) {
		try {
			return func(ctx);
		}  catch (e) {
			console.error('Error while evaluating ' + expression);
			console.error(e);
			return '';
		}
	}

	// Don't want to allow full JS expressions for PHP compat & general
	// sanity. We could do the heavy sanitization work in the compiler & just
	// eval simple JS-compatible expressions here (possibly using 'with',
	// although that is deprecated & disabled in strict mode). For now we play
	// it safe & don't eval the expression. Can relax this later.
	return expression;
};

/*
 * Optimized _evalExpr stub for the code generator
 *
 * Directly dereference the ctx for simple expressions (the common case),
 * and fall back to the full method otherwise.
 */
function evalExprStub(expr, options, inlineVal) {
    inlineVal = inlineVal || '';
	expr = '' + expr;
	var newExpr;
	if (simpleBindingVar.test(expr)) {
		newExpr = rewriteExpression(expr);
		return inlineVal + newExpr;
	} else if (/^'/.test(expr)) {
		// String literal
		return inlineVal + JSON.stringify(expr.slice(1,-1).replace(/\\'/g, "'"));
	} else if (/^[cm](?:\.[a-zA-Z_$]*)?$/.test(expr)) {
		// Simple context or model reference
		return inlineVal + expr;
	} else {
		var catchClause;
		newExpr = rewriteExpression(expr);
		if (options && typeof options.errorHandler === 'function') {
			catchClause = 'c.options.errorHandler(e)';
		} else if (!options || options.errorHandler === undefined) {
			catchClause = '(console.error("Error in " + ' + JSON.stringify(newExpr) +'+": " + e.toString()) || "")';
		}
        if (catchClause) {
            if (inlineVal) {
                return 'try {' + inlineVal + newExpr + ';'
                    + '} catch (e) {' + inlineVal + catchClause + '; }';
            } else {
                return '(function() { '
                    + 'try {'
                    + 'return ' + newExpr + ';'
                    + '} catch (e) { return ' + catchClause + '; }})()';
            }
        } else {
            return inlineVal + newExpr;
        }
	}
}

TAssembly.prototype._getTemplate = function (tpl, ctx) {
	if (Array.isArray(tpl)) {
		return tpl;
	} else {
		// String literal: strip quotes
		if (/^'/.test(tpl)) {
			tpl = tpl.slice(1,-1).replace(/\\'/g, "'");
		}
		return ctx.rc.options.partials[tpl];
	}
};

TAssembly.prototype.ctlFn_foreach = function(options, ctx) {
	// deal with options
	var iterable = this._evalExpr(options.data, ctx);
	if (!iterable || !Array.isArray(iterable)) { return; }
		// worth compiling the nested template
	var tpl = this.compile(this._getTemplate(options.tpl), ctx),
		l = iterable.length,
		newCtx = this.childContext(null, ctx);
	for(var i = 0; i < l; i++) {
		// Update the view model for each iteration
		newCtx.m = iterable[i];
		newCtx.pms[0] = iterable[i];
		// And set the iteration index
		newCtx.i = i;
		tpl(newCtx);
	}
};

TAssembly.prototype.ctlFn_template = function(options, ctx) {
	// deal with options
	var model = this._evalExpr(options.data, ctx),
		newCtx = this.childContext(model, ctx),
		tpl = this._getTemplate(options.tpl, ctx);
	if (tpl) {
		this._render(tpl, newCtx);
	}
};

TAssembly.prototype.ctlFn_with = function(options, ctx) {
	var model = this._evalExpr(options.data, ctx),
		tpl = this._getTemplate(options.tpl, ctx);
	if (model && tpl) {
		var newCtx = this.childContext(model, ctx);
		this._render(tpl, newCtx);
	} else {
		// TODO: hide the parent element similar to visible
	}
};

TAssembly.prototype.ctlFn_if = function(options, ctx) {
	if (this._evalExpr(options.data, ctx)) {
		this._render(options.tpl, ctx);
	}
};

TAssembly.prototype.ctlFn_ifnot = function(options, ctx) {
	if (!this._evalExpr(options.data, ctx)) {
		this._render(options.tpl, ctx);
	}
};

TAssembly.prototype.ctlFn_attr = function(options, ctx) {
	var self = this,
		attVal;
	Object.keys(options).forEach(function(name) {
		var attValObj = options[name];
		if (typeof attValObj === 'string') {
			attVal = self._evalExpr(options[name], ctx);
		} else {
			// Must be an object
			attVal = attValObj.v || '';
			if (attValObj.app && Array.isArray(attValObj.app)) {
				attValObj.app.forEach(function(appItem) {
					if (appItem['if'] && self._evalExpr(appItem['if'], ctx)) {
						attVal += appItem.v || '';
					}
					if (appItem.ifnot && ! self._evalExpr(appItem.ifnot, ctx)) {
						attVal += appItem.v || '';
					}
				});
			}
			if (!attVal && attValObj.v === null) {
				attVal = null;
			}
		}
		if (attVal) {
			if (name === 'href' || name === 'src') {
				attVal = this.attrSanitizer.sanitizeHref(attVal);
			} else if (name === 'style') {
				attVal = this.attrSanitizer.sanitizeStyle(attVal);
			}
		}
		// Omit attributes if they are undefined, null or false
		if (attVal || attVal === 0 || attVal === '') {
			ctx.cb(' ' + name + '="'
				// TODO: context-sensitive sanitization on href / src / style
				// (also in compiled version at end)
				+ attVal.toString().replace(/"/g, '&quot;')
				+ '"');
		}
	});
};

// Actually handled inline for performance
//TAssembly.prototype.ctlFn_text = function(options, ctx) {
//	cb(this._evalExpr(options, ctx));
//};

TAssembly.prototype._xmlEncoder = function(c){
	switch(c) {
		case '<': return '&lt;';
		case '>': return '&gt;';
		case '&': return '&amp;';
		case '"': return '&quot;';
		default: return '&#' + c.charCodeAt() + ';';
	}
};

// Create a child context using plain old objects
TAssembly.prototype.childContext = function (model, parCtx) {
	return {
		m: model,
		pc: parCtx,
		pm: parCtx.m,
		pms: [model].concat(parCtx.ps),
		rm: parCtx.rm,
		rc: parCtx.rc, // the root context
		cb: parCtx.cb
	};
};

TAssembly.prototype._assemble = function(template, options) {
	var code = [],
		cbExpr = [];

	function pushCode(codeChunk) {
		if(cbExpr.length) {
			code.push('cb(' + cbExpr.join('+') + ');');
			cbExpr = [];
		}
		code.push(codeChunk);
	}

	code.push('var val;');

	var self = this,
		l = template.length;
	for(var i = 0; i < l; i++) {
		var bit = template[i],
			c = bit.constructor;
		if (c === String) {
			// static string
			cbExpr.push(JSON.stringify(bit));
		} else if (c === Array) {
			// control structure
			var ctlFn = bit[0],
				ctlOpts = bit[1];

			// Inline raw, text and attr handlers for speed
			if (ctlFn === 'raw') {
				pushCode(evalExprStub(ctlOpts, options, 'val = ') + ';\n');
				cbExpr.push('val');
			} else if (ctlFn === 'text') {
				pushCode('val = ' + evalExprStub(ctlOpts, options) + ';\n'
					// convert val to string
					+ 'val = val || val === 0 ? "" + val : "";\n'
					+ 'if(/[<&]/.test(val)) { val = val.replace(/[<&]/g,this._xmlEncoder); }\n');
				cbExpr.push('val');
			} else if ( ctlFn === 'attr' ) {
				var names = Object.keys(ctlOpts);
				for(var j = 0; j < names.length; j++) {
					var name = names[j];
					if (typeof ctlOpts[name] === 'string') {
						code.push('val = ' + evalExprStub(ctlOpts[name], options) + ';');
					} else {
						// Must be an object
						var attValObj = ctlOpts[name];
						code.push('val=' + JSON.stringify(attValObj.v || ''));
						if (attValObj.app && Array.isArray(attValObj.app)) {
							attValObj.app.forEach(function(appItem) {
								if (appItem['if']) {
									code.push('if(' + evalExprStub(appItem['if'], options) + '){');
									code.push('val += ' + JSON.stringify(appItem.v || '') + ';');
									code.push('}');
								} else if (appItem.ifnot) {
									code.push('if(!' + evalExprStub(appItem.ifnot, options) + '){');
									code.push('val += ' + JSON.stringify(appItem.v || ''));
									code.push('}');
								}
							});
						}
						if (attValObj.v === null) {
							code.push('if(!val) { val = null; }');
						}
					}
					// attribute sanitization
					if (name === 'href' || name === 'src') {
						code.push("if (val) {"
								+ "val = this.attrSanitizer.sanitizeHref(val);"
								+ "}");
					} else if (name === 'style') {
						code.push("if (val) {"
								+ "val = this.attrSanitizer.sanitizeStyle(val);"
								+ "}");
					}
					pushCode("if (val || val === 0 || val === '') { "
						// escape the attribute value
						// TODO: hook up context-sensitive sanitization for href,
						// src, style
						+ '\nval = val || val === 0 ? "" + val : "";'
						+ '\nif(/[<&"]/.test(val)) { val = val.replace(/[<&"]/g,this._xmlEncoder); }'
						+ "\ncb(" + JSON.stringify(' ' + name + '="')
						+ " + val "
						+ "+ '\"');}");
				}
			} else {
				// Generic control function call

				// Store the args in the cache to a) keep the compiled code
				// small, and b) share compilations of sub-blocks between
				// repeated calls
				var uid = this._getUID();
				this.cache[uid] = ctlOpts;

				pushCode('try {');
				// call the method
				code.push('this[' + JSON.stringify('ctlFn_' + ctlFn)
						// store in cache / unique key rather than here
						+ '](this.cache["' + uid + '"], c);');
				code.push('} catch(e) {');
				code.push("console.error('Unsupported control function:', "
						+ JSON.stringify(ctlFn) + ", e.stack);");
				code.push('}');
			}
		} else {
			console.error('Unsupported type:', bit);
		}
	}
	// Force out the cb
	pushCode("");
	return code.join('\n');
};

/**
 * Interpreted template expansion entry point
 *
 * @param {array} template The tassembly template in JSON IR
 * @param {object} c the model or context
 * @param {function} cb (optional) chunk callback for bits of text (instead of
 * return)
 * @return {string} Rendered template string
 */
TAssembly.prototype.render = function(template, model, options) {
	if (!options) { options = {}; }

	// Create the root context
	var ctx = {
		rm: model,
		m: model,
		pms: [model],
		rc: null,
		g: options.globals,
		cb: options.cb,
		options: options
	};
	ctx.rc = ctx;

	var res = '';
	if (!options.cb) {
		ctx.cb = function(bit) {
			res += bit;
		};
	}

	this._render(template, ctx);

	if (!options.cb) {
		return res;
	}
};

TAssembly.prototype._render = function (template, ctx) {
	// Just call a cached compiled version if available
	if (template.__cachedFn) {
		return template.__cachedFn(ctx);
	}

	var self = this,
		l = template.length,
		cb = ctx.cb;
	for(var i = 0; i < l; i++) {
		var bit = template[i],
			c = bit.constructor,
			val;
		if (c === String) {
			cb(bit);
		} else if (c === Array) {
			// control structure
			var ctlFn = bit[0],
				ctlOpts = bit[1];
			if (ctlFn === 'raw') {
				cb(this._evalExpr(ctlOpts, ctx));
            } else if (ctlFn === 'text') {
				val = this._evalExpr(ctlOpts, ctx);
				if (!val && val !== 0) {
					val = '';
				}
				cb( ('' + val) // convert to string
						.replace(/[<&]/g, this._xmlEncoder)); // and escape
			} else {

				try {
					self['ctlFn_' + ctlFn](ctlOpts, ctx);
				} catch(e) {
					console.error('Unsupported control function:', bit, e);
				}
			}
		} else {
			console.error('Unsupported type:', bit);
		}
	}
};


/**
 * Compile a template to a function
 *
 * @param {array} template The tassembly template in JSON IR
 * @param {function} cb (optional) chunk callback for bits of text (instead of
 * return)
 * @return {function} template function(model)
 */
TAssembly.prototype.compile = function(template, options) {
	var self = this, opts = options || {};
	if (template.__cachedFn) {
		return template.__cachedFn;
	}

	var code = '';
	if (!opts.nestedTemplate) {
		// top-level template: set up accumulator
		if (opts.cb) {
			code += 'cb = options.cb;\n';
		} else {
			code += 'var res = "", cb = function(bit) { res += bit; };\n';
		}
		// and the top context
		code += 'var m = c;\n';
		code += 'c = { rc: null, rm: m, m: m, pms: [m], '
			+ 'g: options.globals, options: options, cb: cb, nestedTemplate: true }; c.rc = c;\n';
	} else {
		code += 'var m = c.m, cb = c.cb;\n';
	}

	code += this._assemble(template, opts);

	if (!opts.cb) {
		code += 'return res;';
	}

	// console.error(code);

	var fn = new Function('c', 'options', code),
		boundFn = function(ctx, dynamicOpts) {
			return fn.call(self, ctx, dynamicOpts || opts);
		};
	template.__cachedFn = boundFn;

	return boundFn;
};

// TODO: cut down interface further as it's all static now
module.exports = new TAssembly();
