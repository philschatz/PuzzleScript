/* eslint-env jasmine */
const {default: Parser} = require('../src/parser')
const {COLOR_PALETTES} = require('../src/colors')

function checkGrammar (code) {
  const grammar = Parser.getGrammar()
  const {match} = Parser.parseGrammar(code)
  if (!match.succeeded()) {
    const trace = grammar.trace(code)
    console.log(trace.toString())
  }
  expect(match.succeeded()).toBe(true)

  const s = grammar.createSemantics()
  s.addOperation('toJSON2', {
    _terminal: function () { return this.primitiveValue },
    _iter: function (children) {
      return children.map(child => child.toJSON2())
    },
    _default: function (children) {
      if (this.ctorName === 'word') {
        return this.sourceString
      // } if (this.ctorName[0] === this.ctorName[0].toLowerCase()) {
      //   return this.ctorName
      } else {
        const obj = {
          __name: this.ctorName
        }
        children.forEach((child, index) => {
          const value = child.toJSON2()
          if (!Array.isArray(value) || value.length >= 1) {
            obj[`_i${index}`] = value
          }
        })
        return obj
      }
    }
  })
  const tree = s(match).toJSON2()
  expect(tree).toMatchSnapshot()
  return tree
}

function checkParse (code) {
  const {data, error} = Parser.parse(code)
  expect(error && error.message).toBeFalsy() // Use && so the error messages are shorter
  expect(data).toMatchSnapshot()
  return data
}

function checkParseRule (code, varNames) {
  // Now check if the semantics parsed
  const legendItems = varNames.map(varName => {
    return `${varName} = testObject`
  })
  return checkParse(`
title checkParseRule

===
OBJECTS
===

testObject
transparent

===
LEGEND
===

${legendItems.join('\n')}

====
RULES
====

${code}
`)
}

function parseRule (code, varNames) {
  // Add a header
  checkGrammar(`
title checkGrammar
===
RULES
===
${code}
`)
  return checkParseRule(code, varNames)
}

describe('rules', () => {
  it('parses a simple rule', () => {
    parseRule('[ z ] -> [ ]', ['z'])
  })
  it('parses a simple rule 2', () => {
    parseRule('[ z ] -> [ z ]', ['z'])
  })
  it('parses a simple rule without whitespace', () => {
    parseRule('[z]->[z]', ['z'])
  })
  it('parses a rule with multiple cells', () => {
    parseRule('[ z | x ] -> [ | ]', ['z', 'x'])
  })
  it('parses a rule with multiple layers', () => {
    parseRule('[ z x ] -> [ ]', ['z', 'x'])
  })
  it('parses a rule with ellpisis', () => {
    parseRule('[ z | ... | x | z ] -> [ RANDOM z | ... | x | ]', ['z', 'x'])
  })
  it('parses a rule with a period for a variable name', () => {
    parseRule('[.] -> []', ['.'])
  })
  it('parses a rule with a _ for a variable name', () => {
    parseRule('[z_x] -> []', ['z_x'])
  })

  describe('Cell Modifiers', () => {
    it('parses a rule with directions', () => {
      parseRule('[ACTION z ] -> [ ]', ['z'])
      parseRule('[^ z ] -> [ ]', ['z'])
      parseRule('[v z ] -> [ ]', ['z']) // This needs to be the down arrow, not a variable
      parseRule('[> z ] -> [ ]', ['z'])
      parseRule('[< z ] -> [ ]', ['z'])
      parseRule('[LEFT z ] -> [ ]', ['z'])
      parseRule('[RIGHT z ] -> [ ]', ['z'])
      parseRule('[UP z ] -> [ ]', ['z'])
      parseRule('[DOWN z ] -> [ ]', ['z'])
      parseRule('[STATIONARY z ] -> [ ]', ['z'])
      parseRule('[MOVING z ] -> [ ]', ['z'])
      parseRule('[VERTICAL z ] -> [ ]', ['z'])
      parseRule('[HORIZONTAL z ] -> [ ]', ['z'])
      parseRule('[PERPENDICULAR z ] -> [ ]', ['z'])
      parseRule('[ORTHOGONAL z ] -> [ ]', ['z'])
      parseRule('[RANDOMDIR z ] -> [ ]', ['z'])
    })
    it('parses a rule with modifiers', () => {
      parseRule('[ NO z ] -> [ ]', ['z'])
    })
    it('parses a rule with a variable that begins with the name of a modifier', () => {
      parseRule('[ stationaryz ] -> [ stationaryz ]', ['stationaryz'])
    })
    it('parses a rule with modifiers 2', () => {
      parseRule('[ STATIONARY z ] -> [ z ]', ['z'])
    })
  })

  describe('Commands', () => {
    it('parses a rule with a command inside the brackets (these should be moved up to the Action Commands)', () => {
      parseRule('[z]->[SFX0]', ['z'])
      parseRule('[z]->[z SFX1]', ['z'])
      parseRule('[z]->[z winter]', ['z', 'winter'])
    })
  })

  describe('General Formatting', () => {
    it('parses an almost-empty file', () => {
      Parser.parseGrammar(`title foo`)
    })
    it('parses when there are empty blocks', () => {
      Parser.parseGrammar(`
title foo
===
objects
===
===
legend
===
===
rules
===
===
levels
===
`)
    })
    it('parses object shortcut characters', () => {
      Parser.parseGrammar(`
title foo
===
OBJECTS
===
player Z
transparent

===
RULES
===
[P]->[]

===
LEVELS
===

P`)
    })

    it('Correctly parses weird variable names', () => {
      checkGrammar(`
title foo

===
LEGEND
===

Bush? = Player
. = Player


====
RULES
====

[Bush?] -> [Bush?]
[.] -> [.]
`)
    })

    it('Looks up color palettes using a string or an index', () => {
      let data
      data = checkParse(`
title foo
color_palette gameboycolour

===
OBJECTS
===
player
yellow
`)
      expect(data.objects[0]._color._color.toLowerCase()).toBe(COLOR_PALETTES['gameboycolour']['yellow'].toLowerCase())

      data = checkParse(`
title foo
color_palette 2

===
OBJECTS
===
player
yellow
`)
      expect(data.objects[0]._color._color.toLowerCase()).toBe(COLOR_PALETTES['gameboycolour']['yellow'].toLowerCase())
    })

    it('Supports characters that would be invalid in one scope but are valid in another scope', () => {
      checkParse(`
title foo

===
OBJECTS
===

hello .
transparent

hello2 ]
transparent

hello3 ♡
transparent

=======
LEGEND
=======

[ = hello
, = hello2
д = hello3
sfx11 = hello3 (this is a valid variable name since there are only 10 SFX)

=======
COLLISIONLAYERS
=======

hello,hello2

=======
RULES
=======

[.]->[.]
[♡]->[♡]

`)
    })

    it('Supports objects named using only numbers (mirror-isles)', () => {
      checkParse(`
title foo

===
OBJECTS
===

Table
Yellow Red White
(12121
21212
12121
21212
0...0)
.....
.121.
.212.
.121.
.0.0.

ChairRightLoose
Yellow Red

`)

      checkParse(`
title foo

===
OBJECTS
===

player
yellow
00000
00000
00000
00000
00000

00
yellow

01
yellow

`)
    })
  })

  describe('Expected Failures', () => {
    // Something using collisionLayers. Like A and B are in the same layer and we try to run either: `[ A B ] -> []` or `[A] -> [A B]`
    // Check that the magic objects `Background` and `Player` are set to something
  })
})
