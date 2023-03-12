// Maintenance / build script:
// Re-generate the KnockoutJS expression parser from the grammar
// Called by npm publish and local npm install

var PEG = require('pegjs'),
	fs = require('fs'),
	grammar = fs.readFileSync('./ExpressionParser.peg.js', 'utf8'),
	parser = PEG.buildParser(grammar, {
        output:"source",
        allowedStartRules: ['start', 'expression'],
    });

console.log('Re-building KnockoutExpressionParser.js '
		+ 'from KnockoutExpressionParser.pegjs');
fs.writeFileSync('ExpressionParser.js', 'module.exports = ' + parser);
