import * as _ from 'lodash'
import {
    BaseForLines,
    IGameCode,
    IGameNode,
    IGameTile
} from '../models/game'
import {
    IMutator,
    RuleBracketPair,
    getMatchedMutatorsHelper
} from '../pairs'
import { RULE_MODIFIER, setDifference } from '../util'
import { Cell } from '../engine'

// TODO: We may not be able to be so smart about this; We may need to expand the
// Rule into multiple Rules when HORIZONTAL, VERTICAL, ORTHOGONAL, or nothing
// are passed in as directions.
// Because of https://www.puzzlescript.net/Documentation/executionorder.html
export class GameRule extends BaseForLines implements IRule {
    _modifiers: Set<RULE_MODIFIER>
    _commands: string[]
    _bracketPairs: RuleBracketPair[]
    _hasEllipsis: boolean
    // _conditionCommandPair: RuleConditionCommandPair[]

    constructor(source: IGameCode, modifiers: Set<RULE_MODIFIER>, conditions: RuleBracket[], actions: RuleBracket[], commands: string[]) {
        super(source)
        this._modifiers = modifiers
        this._hasEllipsis = false

        // Set _hasEllipsis value
        for (let i = 0; i < conditions.length; i++) {
            const condition = conditions[i]
            if (condition.hasEllipsis()) {
                this._hasEllipsis = true
                break
            }
        }

        // Check if valid
        if (conditions.length !== actions.length && actions.length !== 0) {
            throw new Error(`Left side has "${conditions.length}" conditions and right side has "${actions.length}" actions!`)
        }

        if (conditions.length === actions.length) {
            this._bracketPairs = _.zip(conditions, actions).map(([condition, action]) => {
                return new RuleBracketPair(this._modifiers, condition, action)
            })
        } else if (actions.length !== 0) {
            throw new Error(`Invalid Rule. The number of brackets on the right must match the structure of the left hand side or be 0`)
        }
        // TODO: build the _conditionCommandPair
        if (commands.length > 0) {
            this._bracketPairs = []
        }
    }

    getMatchedMutatorsOrNull(cell: Cell) {
        // If the rule has any modifiers that we do not understand, return null
        if (setDifference(this._modifiers, SUPPORTED_RULE_MODIFIERS).size > 0) {
            return null
        }
        return getMatchedMutatorsHelper(this._bracketPairs, cell)
    }
}

export class RuleBracket extends BaseForLines {
    _neighbors: RuleBracketNeighbor[]
    _hasEllipsis: boolean

    constructor(source: IGameCode, neighbors: RuleBracketNeighbor[], hack: string) {
        super(source)
        this._neighbors = neighbors
        this._hasEllipsis = false

        for (let i = 0; i < neighbors.length; i++) {
            const neighbor = neighbors[i]
            if (neighbor.isEllipsis()) {
                this._hasEllipsis = true
                break
            }
        }
    }

    hasEllipsis() {
        return this._hasEllipsis
    }
}

export class RuleBracketNeighbor extends BaseForLines {
    _tilesWithModifier: TileWithModifier[]
    _isEllipsis: boolean

    constructor(source: IGameCode, tilesWithModifier: TileWithModifier[], isEllipsis: boolean) {
        super(source)
        this._tilesWithModifier = tilesWithModifier
        this._isEllipsis = isEllipsis
    }

    isEllipsis() {
        return this._isEllipsis
    }
}

export class TileWithModifier extends BaseForLines {
    _modifier?: string
    _tile: IGameTile

    constructor(source: IGameCode, modifier: string, tile: IGameTile) {
        super(source)
        this._modifier = modifier
        this._tile = tile
    }

    isNo() {
        return M_NO === this._modifier
    }

    matchesCell(cell: Cell) {
        if (this._modifier && !SUPPORTED_CELL_MODIFIERS.has(this._modifier)) {
            return false // Modifier not supported yet
        }
        const hasTile = this._tile && this._tile.matchesCell(cell)
        if (this.isNo()) {
            return !hasTile
        } else {
            return hasTile
        }
    }

}

// Extend RuleBracketNeighbor so that NeighborPair doesn't break
export class HackNode extends RuleBracketNeighbor {
    fields: object

    // These should be addressed as we write the interpreter
    constructor(source: IGameCode, fields: object) {
        super(source, [], false)
        this.fields = fields
    }

    isEllipsis() {
        return false
    }
}

export interface IRule extends IGameNode {
    getMatchedMutatorsOrNull: (cell: Cell) => IMutator[] | null
}

export class GameRuleLoop extends BaseForLines implements IRule {
    _rules: GameRule[]

    constructor(source: IGameCode, rules: GameRule[]) {
        super(source)
        this._rules = rules
    }

    getMatchedMutatorsOrNull(cell: Cell): IMutator[] {
        return null // Not implemented yet
        // return getMatchedMutatorsHelper(this._rules, cell)
    }

}

export class GameRuleGroup extends GameRuleLoop {
    // do we really need this class?
}

const M_STATIONARY = 'STATIONARY'
const M_NO = 'NO'
const SUPPORTED_CELL_MODIFIERS = new Set([M_STATIONARY, M_NO])
const SUPPORTED_RULE_MODIFIERS = new Set([
    RULE_MODIFIER.UP,
    RULE_MODIFIER.DOWN,
    RULE_MODIFIER.LEFT,
    RULE_MODIFIER.RIGHT,
    RULE_MODIFIER.HORIZONTAL,
    RULE_MODIFIER.VERTICAL,
    RULE_MODIFIER.ORTHOGONAL
])