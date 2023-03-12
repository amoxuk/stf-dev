// KnockoutJS expression grammar with rewriting to TAssembly expressions

start = '{'? spc kvs:key_values spc '}'? { return kvs; }

key_values =
    kv:key_value
    kvs:(spc ',' spc kvv:key_value { return kvv; })*
    {
        var res = {};
        [kv].concat(kvs).forEach(function(tuple) {
            res[tuple[0]] = tuple[1];
        });
        return res;
    }

key_value =
    k:(varname
            // Unquote string
            / s:string { return s.slice(1,-1).replace(/\\'/g,"'"); } )
    spc ':'
    spc v:expression spc
    { return [k,v]; }

object = '{' spc kvs:key_values? spc '}'
    { return kvs || {}; }

array = '[' spc e:expression es:(spc ',' spc ee:expression { return ee; })* spc ']'
    { return [e].concat(es); }

expression = spc v:(variable / object / array / number / string) spc
    { return v; }

variable = v:varpart vs:(spc '.' vp:varpart { return vp; })*
    {
        var res = v;
        var vars = [v].concat(vs);
        // Rewrite the first path component
        if (options._ctxMatcher(v)) {
            // Built-in context var access
            res = options.ctxMap[res.substr(1)];
        } else if (/\)$/.test(v) && options.callPrefix) {
            res = options.callPrefix + res;
        } else if ((vs.length || /^[^\[]+\[.*\]$/.test(v)) && options.dottedPathPrefix) {
            // Either a dotted path, or a variable followed by array
            // dereference.
            res = options.dottedPathPrefix + res;
        } else {
            // local model access
            res = (options.modelPrefix || 'm') + res;
        }

        // remaining path members
        // TODO: Really fix this.
        for (var i = 1, l = vars.length; i < l; i++) {
            var v = vars[i];
            if (/^\.\$/.test(v)
                    && (vars[i-1] === '.$parentContext'
                        || vars[i-1] === '.$context')
                )
            {
                // only rewrite if previous path element can be a context
                res += (options._ctxMatcher(vars[i-1]) && '.' + options.ctxMap[v.substr(1)]
                        || v);
            } else {
                res += v;
            }
        }

        return res;
    }

varpart = vs:varpart_segment r:arrayref? c:call?
    {
        return vs + (r || '') + (c || '');
    }

varpart_segment = vs:$([a-z_$]i [a-z0-9_$-]i*)
    {
        // Encode hyphenated segments as array dereferences
        if (/-/.test(vs)) {
            return "['" + vs.replace(/'/g, "\\'") + "']";
        } else {
            return '.' + vs;
        }
    }

varname = $([a-z_$]i [a-z0-9_$-]i*)

arrayref = '[' spc e:expression spc ']'
    { return '[' + options.stringifyObject(e) + ']'; }

call = '(' spc p:parameters spc ')'
    { return '(' + p + ')'; }

parameters = p0:expression? ps:(spc ',' spc pn:expression { return pn; })*
    {
        var params = [p0 || ''].concat(ps);
        params = params.map(function(p) {
            return options.stringifyObject(p);
        });
        return params.join(',');
    }

string =
  (["] s:$([^"\\]+ / '\\"')* ["]
    { return "'" + s.replace(/\\"/g, '"').replace(/'/g, "\\'") + "'"; } )
  / (['] s:$([^'\\]+ / "\\'")* ['] { return "'" + s + "'" } )

number = [0-9]+ ('.' [0-9]+)?
    { return Number(text()); }

spc = [ \t\n]*

/* Tabs do not mix well with the hybrid production syntax */
/* vim: set filetype=javascript expandtab ts=4 sw=4 cindent : */
