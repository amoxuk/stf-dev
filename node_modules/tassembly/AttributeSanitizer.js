"use strict";

var protocolRegex = new RegExp( '^(' + [
      "http://",
      "https://",
      "ftp://",
      "irc://",
      "ircs://",
      "gopher://",
      "telnet://",
      "nntp://",
      "worldwind://",
      "mailto:",
      "news:",
      "svn://",
      "git://",
      "mms://",
      "//"
    ].join('|') + ')', 'i'),
	CHAR_REFS_RE = /&([A-Za-z0-9\x80-\xff]+);|&\#([0-9]+);|&\#[xX]([0-9A-Fa-f]+);|(&)/;

function AttributeSanitizer(options) {
	// XXX: make protocol regexp configurable!
	this.protocolRegex = protocolRegex;
}

/**
 * Decode any character references, numeric or named entities,
 * in the text and return a UTF-8 string.
 */
AttributeSanitizer.prototype.decodeCharReferences = function ( text ) {
	var sanitizer = this;
	return text.replace(CHAR_REFS_RE, function() {
		if (arguments[1]) {
			return sanitizer.decodeEntity(arguments[1]);
		} else if (arguments[2]) {
			return sanitizer.decodeChar(parseInt(arguments[2], 10));
		} else if (arguments[3]) {
			return sanitizer.decodeChar(parseInt(arguments[3], 16));
		} else {
			return arguments[4];
		}
	});
};

var IDN_RE = new RegExp(
		"[\t ]|" +  // general whitespace
		"\u00ad|" + // 00ad SOFT HYPHEN
		"\u1806|" + // 1806 MONGOLIAN TODO SOFT HYPHEN
		"\u200b|" + // 200b ZERO WIDTH SPACE
		"\u2060|" + // 2060 WORD JOINER
		"\ufeff|" + // feff ZERO WIDTH NO-BREAK SPACE
		"\u034f|" + // 034f COMBINING GRAPHEME JOINER
		"\u180b|" + // 180b MONGOLIAN FREE VARIATION SELECTOR ONE
		"\u180c|" + // 180c MONGOLIAN FREE VARIATION SELECTOR TWO
		"\u180d|" + // 180d MONGOLIAN FREE VARIATION SELECTOR THREE
		"\u200c|" + // 200c ZERO WIDTH NON-JOINER
		"\u200d|" + // 200d ZERO WIDTH JOINER
		"[\ufe00-\ufe0f]", // fe00-fe0f VARIATION SELECTOR-1-16
		'g'
		);

function stripIDNs ( host ) {
	return host.replace( IDN_RE, '' );
}

function codepointToUtf8 (cp) {
	try {
		return String.fromCharCode(cp);
	} catch (e) {
		// Return a tofu?
		return cp.toString();
	}
}

AttributeSanitizer.prototype.cssDecodeRE = (function() {
	// Decode escape sequences and line continuation
	// See the grammar in the CSS 2 spec, appendix D.
	// This has to be done AFTER decoding character references.
	// This means it isn't possible for this function to return
	// unsanitized escape sequences. It is possible to manufacture
	// input that contains character references that decode to
	// escape sequences that decode to character references, but
	// it's OK for the return value to contain character references
	// because the caller is supposed to escape those anyway.
	var space = '[\\x20\\t\\r\\n\\f]';
	var nl = '(?:\\n|\\r\\n|\\r|\\f)';
	var backslash = '\\\\';
	return new RegExp(backslash +
		"(?:" +
		"(" + nl + ")|" + // 1. Line continuation
		"([0-9A-Fa-f]{1,6})" + space + "?|" + // 2. character number
		"(.)|" + // 3. backslash cancelling special meaning
		"()$" + // 4. backslash at end of string
		")");
})();

AttributeSanitizer.prototype.sanitizeStyle = function (text) {
	function removeMismatchedQuoteChar(str, quoteChar) {
		var re1, re2;
		if (quoteChar === "'") {
			re1 = /'/g;
			re2 = /'([^'\n\r\f]*)$/;
		} else {
			re1 = /"/g;
			re2 = /"([^"\n\r\f]*)$/;
		}

		var mismatch = ((str.match(re1) || []).length) % 2 === 1;
		if (mismatch) {
			str = str.replace(re2, function() {
				// replace the mismatched quoteChar with a space
				return " " + arguments[1];
			});
		}

		return str;
	}

	// Decode character references like &#123;
	text = this.decodeCharReferences(text);
	text = text.replace(this.cssDecodeRE, function() {
				var c;
				if (arguments[1] !== undefined ) {
					// Line continuation
					return '';
				} else if (arguments[2] !== undefined ) {
					c = codepointToUtf8(parseInt(arguments[2], 16));
				} else if (arguments[3] !== undefined ) {
					c = arguments[3];
				} else {
					c = '\\';
				}

				if ( c === "\n" || c === '"' || c === "'" || c === '\\' ) {
					// These characters need to be escaped in strings
					// Clean up the escape sequence to avoid parsing errors by clients
					return '\\' + (c.charCodeAt(0)).toString(16) + ' ';
				} else {
					// Decode unnecessary escape
					return c;
				}
			});

	// Remove any comments; IE gets token splitting wrong
	// This must be done AFTER decoding character references and
	// escape sequences, because those steps can introduce comments
	// This step cannot introduce character references or escape
	// sequences, because it replaces comments with spaces rather
	// than removing them completely.
	text = text.replace(/\/\*.*\*\//g, ' ');

	// Fix up unmatched double-quote and single-quote chars
	// Full CSS syntax here: http://www.w3.org/TR/CSS21/syndata.html#syntax
	//
	// This can be converted to a function and called once for ' and "
	// but we have to construct 4 different REs anyway
	text = removeMismatchedQuoteChar(text, "'");
	text = removeMismatchedQuoteChar(text, '"');

	/* --------- shorter but less efficient alternative to removeMismatchedQuoteChar ------------
	text = text.replace(/("[^"\n\r\f]*")+|('[^'\n\r\f]*')+|([^'"\n\r\f]+)|"([^"\n\r\f]*)$|'([^'\n\r\f]*)$/g, function() {
		return arguments[1] || arguments[2] || arguments[3] || arguments[4]|| arguments[5];
	});
	* ----------------------------------- */

	// Remove anything after a comment-start token, to guard against
	// incorrect client implementations.
	var commentPos = text.indexOf('/*');
	if (commentPos >= 0) {
		text = text.substr( 0, commentPos );
	}

	// SSS FIXME: Looks like the HTML5 library normalizes attributes
	// and gets rid of these attribute values -- something that needs
	// investigation and fixing.
	//
	// So, style="/* insecure input */" comes out as style=""
	if (/[\000-\010\016-\037\177]/.test(text)) {
		return '/* invalid control char */';
	}
	if (/expression|filter\s*:|accelerator\s*:|url\s*\(/i.test(text)) {
		return '/* insecure input */';
	}
	return text;
};

AttributeSanitizer.prototype.sanitizeHref = function ( href ) {
	// protocol needs to begin with a letter (ie, .// is not a protocol)
	var bits = href.match( /^((?:[a-zA-Z][^:\/]*:)?(?:\/\/)?)([^\/]+)(\/?.*)/ ),
		proto, host, path;
	if ( bits ) {
		proto = bits[1];
		host = bits[2];
		path = bits[3];
		if ( ! proto.match(this.protocolRegex)) {
			// invalid proto, disallow URL
			return null;
		}
	} else {
		proto = '';
		host = '';
		path = href;
	}
	host = stripIDNs( host );

	return proto + host + path;
};

module.exports = {AttributeSanitizer: AttributeSanitizer};
