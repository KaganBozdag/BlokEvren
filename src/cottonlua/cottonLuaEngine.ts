import {
  AchievementCategory,
  AchievementDef,
  AchievementTier,
  AnimationConfig,
  AnimationStyle,
  BiomeType,
  BlockPattern,
  CubeFaceKey,
  CuboidPart,
  CustomModel3D,
  GameMode,
  ModBlockSpec,
  ModCommandSpec,
  ModDefinition,
  ModItemSpec,
  ModRecipeSpec,
  ModToolSpec,
  ToolType,
  WeaponKind,
  WeaponSpec,
} from '../types/game';
import { BUILTIN_API_ENTRIES } from './builtinApis';

// ===================== RUNTIME BRIDGE TYPES =====================
export interface CottonLuaWorldBridge {
  getBlock: (x: number, y: number, z: number) => string;
  setBlock: (x: number, y: number, z: number, blockId: string) => void;
  fill: (
    x1: number,
    y1: number,
    z1: number,
    x2: number,
    y2: number,
    z2: number,
    blockId: string,
  ) => void;
  explode: (x: number, y: number, z: number, radius: number) => void;
  spawnParticles: (x: number, y: number, z: number, color: string, count: number) => void;
  spawnHearts: (x: number, y: number, z: number, count: number) => void;
  spawnLightning: (x: number, y: number, z: number, color: string) => void;
  spawnMob: (kind: string, x: number, y: number, z: number, isBaby: boolean) => void;
  fireProjectile: (opts: {
    x: number;
    y: number;
    z: number;
    dx: number;
    dy: number;
    dz: number;
    speed: number;
    damage: number;
    color: string;
    explosionPower?: number;
    lightning?: boolean;
    knockback?: number;
  }) => void;
  getTime: () => number;
  setTime: (t: number) => void;
  getPlayerPos: () => { x: number; y: number; z: number; yaw: number; pitch: number };
  teleportPlayer: (x: number, y: number, z: number) => void;
  launchPlayer: (vx: number, vy: number, vz: number) => void;
  healPlayer: (amount: number) => void;
  giveItem: (itemId: string, count: number) => void;
  setGameMode: (gm: GameMode) => void;
  say: (text: string) => void;
  playSound: (kind: string) => void;
  triggerAchievement: (code: string, amount?: number) => void;
}

export interface CottonLuaHookContext {
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  playerX: number;
  playerY: number;
  playerZ: number;
  blockId?: string;
  itemId?: string;
  targetMobKind?: string;
  args?: string[];
}

export interface CottonLuaItemHooks {
  onPlace?: LuaFnValue;
  onBreak?: LuaFnValue;
  onUse?: LuaFnValue;
  onAttack?: LuaFnValue;
  onTick?: LuaFnValue;
}

export interface CompiledCottonLuaResult {
  ok: boolean;
  modName: string;
  modVersion: string;
  modDescription: string;
  dependencies: string[];
  blocks: ModBlockSpec[];
  items: ModItemSpec[];
  tools: ModToolSpec[];
  recipes: ModRecipeSpec[];
  commands: ModCommandSpec[];
  achievements: AchievementDef[];
  itemHooks: Map<string, CottonLuaItemHooks>;
  commandHandlers: Map<string, LuaFnValue>;
  worldTickHooks: LuaFnValue[];
  logs: string[];
  warnings: string[];
  errors: string[];
  invokeHook: (
    fn: LuaFnValue,
    bridge: CottonLuaWorldBridge,
    ctx: CottonLuaHookContext,
  ) => { ok: boolean; error?: string };
}

// ===================== TOKENIZER =====================
type TokenType =
  | 'number'
  | 'string'
  | 'ident'
  | 'keyword'
  | 'op'
  | 'punct'
  | 'eof';

interface Token {
  type: TokenType;
  value: string;
  line: number;
  col: number;
}

const KEYWORDS = new Set([
  'local',
  'function',
  'end',
  'if',
  'then',
  'elseif',
  'else',
  'for',
  'in',
  'do',
  'while',
  'repeat',
  'until',
  'return',
  'break',
  'and',
  'or',
  'not',
  'true',
  'false',
  'nil',
]);

class CottonLuaSyntaxError extends Error {
  line: number;
  col: number;
  constructor(msg: string, line: number, col: number) {
    super(`Satır ${line}, Sütun ${col}: ${msg}`);
    this.line = line;
    this.col = col;
  }
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;
  let col = 1;

  const advance = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (src[i] === '\n') {
        line++;
        col = 1;
      } else {
        col++;
      }
      i++;
    }
  };

  while (i < src.length) {
    const ch = src[i];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      advance();
      continue;
    }

    // Comments (-- and --[[ ... ]])
    if (ch === '-' && src[i + 1] === '-') {
      advance(2);
      if (src[i] === '[' && src[i + 1] === '[') {
        advance(2);
        while (i < src.length && !(src[i] === ']' && src[i + 1] === ']')) {
          advance();
        }
        if (i < src.length) advance(2);
      } else {
        while (i < src.length && src[i] !== '\n') advance();
      }
      continue;
    }

    const startLine = line;
    const startCol = col;

    // Long string [[ ... ]]
    if (ch === '[' && src[i + 1] === '[') {
      advance(2);
      let s = '';
      while (i < src.length && !(src[i] === ']' && src[i + 1] === ']')) {
        s += src[i];
        advance();
      }
      if (i >= src.length) {
        throw new CottonLuaSyntaxError('Kapanmamış uzun metin ([[ ... ]])', startLine, startCol);
      }
      advance(2);
      tokens.push({ type: 'string', value: s, line: startLine, col: startCol });
      continue;
    }

    // Quoted strings
    if (ch === '"' || ch === "'") {
      const quote = ch;
      advance();
      let s = '';
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\n') {
          throw new CottonLuaSyntaxError('Metin satır sonunda kapanmadı', startLine, startCol);
        }
        if (src[i] === '\\') {
          advance();
          const esc = src[i];
          if (esc === 'n') s += '\n';
          else if (esc === 't') s += '\t';
          else if (esc === 'r') s += '\r';
          else if (esc !== undefined) s += esc;
          advance();
        } else {
          s += src[i];
          advance();
        }
      }
      if (i >= src.length) {
        throw new CottonLuaSyntaxError('Kapanmamış metin tırnağı', startLine, startCol);
      }
      advance();
      tokens.push({ type: 'string', value: s, line: startLine, col: startCol });
      continue;
    }

    // Numbers
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let numStr = '';
      if (ch === '0' && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
        numStr += '0x';
        advance(2);
        while (i < src.length && /[0-9a-fA-F]/.test(src[i])) {
          numStr += src[i];
          advance();
        }
      } else {
        while (i < src.length && /[0-9]/.test(src[i])) {
          numStr += src[i];
          advance();
        }
        if (src[i] === '.' && src[i + 1] !== '.') {
          numStr += '.';
          advance();
          while (i < src.length && /[0-9]/.test(src[i])) {
            numStr += src[i];
            advance();
          }
        }
      }
      tokens.push({ type: 'number', value: numStr, line: startLine, col: startCol });
      continue;
    }

    // Identifiers & keywords (also allow Turkish Unicode letters in identifiers cleanly)
    if (/[a-zA-Z_ğüşöçıİĞÜŞÖÇ]/.test(ch)) {
      let id = '';
      while (i < src.length && /[a-zA-Z0-9_ğüşöçıİĞÜŞÖÇ]/.test(src[i])) {
        id += src[i];
        advance();
      }
      tokens.push({
        type: KEYWORDS.has(id) ? 'keyword' : 'ident',
        value: id,
        line: startLine,
        col: startCol,
      });
      continue;
    }

    // Two-char operators
    const two = src.slice(i, i + 2);
    if (['==', '~=', '!=', '<=', '>=', '..'].includes(two)) {
      advance(2);
      tokens.push({ type: 'op', value: two, line: startLine, col: startCol });
      continue;
    }

    // Single-char ops & punct
    if ('+-*/%^#<>='.includes(ch)) {
      advance();
      tokens.push({ type: 'op', value: ch, line: startLine, col: startCol });
      continue;
    }
    if ('(){}[],.;:'.includes(ch)) {
      advance();
      tokens.push({ type: 'punct', value: ch, line: startLine, col: startCol });
      continue;
    }

    throw new CottonLuaSyntaxError(`Beklenmeyen karakter: "${ch}"`, startLine, startCol);
  }

  tokens.push({ type: 'eof', value: '', line, col });
  return tokens;
}

// ===================== AST NODES =====================
type Stmt =
  | { kind: 'local'; names: string[]; values: Expr[]; line: number }
  | { kind: 'assign'; targets: LValue[]; values: Expr[]; line: number }
  | { kind: 'expr'; expr: Expr; line: number }
  | { kind: 'funcDecl'; isLocal: boolean; path: string[]; isMethod: boolean; params: string[]; body: Stmt[]; line: number }
  | { kind: 'if'; branches: { cond: Expr; body: Stmt[] }[]; elseBody?: Stmt[]; line: number }
  | { kind: 'forNum'; varName: string; start: Expr; end: Expr; step?: Expr; body: Stmt[]; line: number }
  | { kind: 'forIn'; names: string[]; iter: Expr; body: Stmt[]; line: number }
  | { kind: 'while'; cond: Expr; body: Stmt[]; line: number }
  | { kind: 'repeat'; body: Stmt[]; cond: Expr; line: number }
  | { kind: 'return'; values: Expr[]; line: number }
  | { kind: 'break'; line: number };

type LValue =
  | { kind: 'ident'; name: string }
  | { kind: 'member'; obj: Expr; prop: string }
  | { kind: 'index'; obj: Expr; key: Expr };

interface TableField {
  keys?: string[]; // supports multi-key: left,right,front,back,up,down = expr
  keyExpr?: Expr;
  value: Expr;
}

type Expr =
  | { kind: 'nil' }
  | { kind: 'bool'; value: boolean }
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'ident'; name: string; line: number }
  | { kind: 'table'; fields: TableField[]; line: number }
  | { kind: 'func'; params: string[]; body: Stmt[]; line: number }
  | { kind: 'unary'; op: string; arg: Expr; line: number }
  | { kind: 'binary'; op: string; left: Expr; right: Expr; line: number }
  | { kind: 'member'; obj: Expr; prop: string; line: number }
  | { kind: 'index'; obj: Expr; key: Expr; line: number }
  | { kind: 'call'; callee: Expr; args: Expr[]; method?: string; line: number };

// ===================== RECURSIVE DESCENT PARSER =====================
class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private next(): Token {
    const t = this.peek();
    if (t.type !== 'eof') this.pos++;
    return t;
  }

  private is(type: TokenType, value?: string, offset = 0): boolean {
    const t = this.peek(offset);
    if (t.type !== type) return false;
    return value === undefined || t.value === value;
  }

  private expect(type: TokenType, value?: string, msg?: string): Token {
    const t = this.peek();
    if (!this.is(type, value)) {
      throw new CottonLuaSyntaxError(
        msg || `Beklenen "${value || type}", gelen "${t.value || t.type}"`,
        t.line,
        t.col,
      );
    }
    return this.next();
  }

  parseProgram(): Stmt[] {
    const stmts: Stmt[] = [];
    while (!this.is('eof')) {
      if (this.is('punct', ';')) {
        this.next();
        continue;
      }
      stmts.push(this.parseStmt());
    }
    return stmts;
  }

  private parseBlock(stopKeywords: string[]): Stmt[] {
    const stmts: Stmt[] = [];
    while (!this.is('eof') && !(this.peek().type === 'keyword' && stopKeywords.includes(this.peek().value))) {
      if (this.is('punct', ';')) {
        this.next();
        continue;
      }
      stmts.push(this.parseStmt());
    }
    return stmts;
  }

  private parseStmt(): Stmt {
    const t = this.peek();

    if (this.is('keyword', 'local')) {
      this.next();
      if (this.is('keyword', 'function')) {
        this.next();
        const name = this.expect('ident', undefined, 'Fonksiyon adı bekleniyor').value;
        const { params, body } = this.parseFuncBody();
        return { kind: 'funcDecl', isLocal: true, path: [name], isMethod: false, params, body, line: t.line };
      }
      const names: string[] = [this.expect('ident', undefined, 'Değişken adı bekleniyor').value];
      while (this.is('punct', ',')) {
        this.next();
        names.push(this.expect('ident', undefined, 'Değişken adı bekleniyor').value);
      }
      let values: Expr[] = [];
      if (this.is('op', '=')) {
        this.next();
        values = this.parseExprList();
      } else if (names.length === 1 && this.is('punct', '{')) {
        // Support CottonLua sugar: local thingTextures{ ... }
        values = [this.parseTable()];
      }
      return { kind: 'local', names, values, line: t.line };
    }

    if (this.is('keyword', 'function')) {
      this.next();
      const path: string[] = [this.expect('ident', undefined, 'Fonksiyon adı bekleniyor').value];
      let isMethod = false;
      while (this.is('punct', '.')) {
        this.next();
        path.push(this.expect('ident', undefined, 'Alan adı bekleniyor').value);
      }
      if (this.is('punct', ':')) {
        this.next();
        isMethod = true;
        path.push(this.expect('ident', undefined, 'Metot adı bekleniyor').value);
      }
      const { params, body } = this.parseFuncBody();
      return { kind: 'funcDecl', isLocal: false, path, isMethod, params, body, line: t.line };
    }

    if (this.is('keyword', 'if')) {
      this.next();
      const branches: { cond: Expr; body: Stmt[] }[] = [];
      const cond = this.parseExpr();
      this.expect('keyword', 'then', '"then" bekleniyor');
      const body = this.parseBlock(['elseif', 'else', 'end']);
      branches.push({ cond, body });
      while (this.is('keyword', 'elseif')) {
        this.next();
        const econd = this.parseExpr();
        this.expect('keyword', 'then', '"then" bekleniyor');
        const ebody = this.parseBlock(['elseif', 'else', 'end']);
        branches.push({ cond: econd, body: ebody });
      }
      let elseBody: Stmt[] | undefined;
      if (this.is('keyword', 'else')) {
        this.next();
        elseBody = this.parseBlock(['end']);
      }
      this.expect('keyword', 'end', '"if" bloğu için "end" bekleniyor');
      return { kind: 'if', branches, elseBody, line: t.line };
    }

    if (this.is('keyword', 'for')) {
      this.next();
      const first = this.expect('ident', undefined, 'Döngü değişkeni bekleniyor').value;
      if (this.is('op', '=')) {
        this.next();
        const start = this.parseExpr();
        this.expect('punct', ',', '"," bekleniyor');
        const end = this.parseExpr();
        let step: Expr | undefined;
        if (this.is('punct', ',')) {
          this.next();
          step = this.parseExpr();
        }
        this.expect('keyword', 'do', '"do" bekleniyor');
        const body = this.parseBlock(['end']);
        this.expect('keyword', 'end', '"for" bloğu için "end" bekleniyor');
        return { kind: 'forNum', varName: first, start, end, step, body, line: t.line };
      } else {
        const names = [first];
        while (this.is('punct', ',')) {
          this.next();
          names.push(this.expect('ident', undefined, 'Döngü değişkeni bekleniyor').value);
        }
        this.expect('keyword', 'in', '"in" bekleniyor');
        const iter = this.parseExpr();
        // Allow optional extra iter exprs gracefully
        while (this.is('punct', ',')) {
          this.next();
          this.parseExpr();
        }
        this.expect('keyword', 'do', '"do" bekleniyor');
        const body = this.parseBlock(['end']);
        this.expect('keyword', 'end', '"for" bloğu için "end" bekleniyor');
        return { kind: 'forIn', names, iter, body, line: t.line };
      }
    }

    if (this.is('keyword', 'while')) {
      this.next();
      const cond = this.parseExpr();
      this.expect('keyword', 'do', '"do" bekleniyor');
      const body = this.parseBlock(['end']);
      this.expect('keyword', 'end', '"while" bloğu için "end" bekleniyor');
      return { kind: 'while', cond, body, line: t.line };
    }

    if (this.is('keyword', 'repeat')) {
      this.next();
      const body = this.parseBlock(['until']);
      this.expect('keyword', 'until', '"until" bekleniyor');
      const cond = this.parseExpr();
      return { kind: 'repeat', body, cond, line: t.line };
    }

    if (this.is('keyword', 'return')) {
      this.next();
      const values: Expr[] = [];
      if (
        !this.is('eof') &&
        !this.is('punct', ';') &&
        !(this.peek().type === 'keyword' && ['end', 'else', 'elseif', 'until'].includes(this.peek().value))
      ) {
        values.push(...this.parseExprList());
      }
      return { kind: 'return', values, line: t.line };
    }

    if (this.is('keyword', 'break')) {
      this.next();
      return { kind: 'break', line: t.line };
    }

    // Expression or Assignment
    const firstExpr = this.parseSuffixedExpr();
    if (this.is('op', '=') || this.is('punct', ',')) {
      const targets: LValue[] = [this.toLValue(firstExpr, t)];
      while (this.is('punct', ',')) {
        this.next();
        const nextExpr = this.parseSuffixedExpr();
        targets.push(this.toLValue(nextExpr, t));
      }
      this.expect('op', '=', '"=" atama operatörü bekleniyor');
      const values = this.parseExprList();
      return { kind: 'assign', targets, values, line: t.line };
    }

    return { kind: 'expr', expr: firstExpr, line: t.line };
  }

  private toLValue(expr: Expr, t: Token): LValue {
    if (expr.kind === 'ident') return { kind: 'ident', name: expr.name };
    if (expr.kind === 'member') return { kind: 'member', obj: expr.obj, prop: expr.prop };
    if (expr.kind === 'index') return { kind: 'index', obj: expr.obj, key: expr.key };
    throw new CottonLuaSyntaxError('Geçersiz atama hedefi', t.line, t.col);
  }

  private parseFuncBody(): { params: string[]; body: Stmt[] } {
    this.expect('punct', '(', '"(" bekleniyor');
    const params: string[] = [];
    if (!this.is('punct', ')')) {
      params.push(this.expect('ident', undefined, 'Parametre adı bekleniyor').value);
      while (this.is('punct', ',')) {
        this.next();
        params.push(this.expect('ident', undefined, 'Parametre adı bekleniyor').value);
      }
    }
    this.expect('punct', ')', '")" bekleniyor');
    const body = this.parseBlock(['end']);
    this.expect('keyword', 'end', 'Fonksiyon için "end" bekleniyor');
    return { params, body };
  }

  private parseExprList(): Expr[] {
    const list: Expr[] = [this.parseExpr()];
    while (this.is('punct', ',')) {
      this.next();
      list.push(this.parseExpr());
    }
    return list;
  }

  private parseExpr(): Expr {
    return this.parseOr();
  }

  private parseOr(): Expr {
    let left = this.parseAnd();
    while (this.is('keyword', 'or')) {
      const t = this.next();
      const right = this.parseAnd();
      left = { kind: 'binary', op: 'or', left, right, line: t.line };
    }
    return left;
  }

  private parseAnd(): Expr {
    let left = this.parseCompare();
    while (this.is('keyword', 'and')) {
      const t = this.next();
      const right = this.parseCompare();
      left = { kind: 'binary', op: 'and', left, right, line: t.line };
    }
    return left;
  }

  private parseCompare(): Expr {
    let left = this.parseConcat();
    while (
      this.peek().type === 'op' &&
      ['==', '~=', '!=', '<', '<=', '>', '>='].includes(this.peek().value)
    ) {
      const t = this.next();
      const right = this.parseConcat();
      left = { kind: 'binary', op: t.value, left, right, line: t.line };
    }
    return left;
  }

  private parseConcat(): Expr {
    const left = this.parseAddSub();
    if (this.is('op', '..')) {
      const t = this.next();
      const right = this.parseConcat();
      return { kind: 'binary', op: '..', left, right, line: t.line };
    }
    return left;
  }

  private parseAddSub(): Expr {
    let left = this.parseMulDiv();
    while (this.peek().type === 'op' && (this.peek().value === '+' || this.peek().value === '-')) {
      const t = this.next();
      const right = this.parseMulDiv();
      left = { kind: 'binary', op: t.value, left, right, line: t.line };
    }
    return left;
  }

  private parseMulDiv(): Expr {
    let left = this.parseUnary();
    while (
      this.peek().type === 'op' &&
      (this.peek().value === '*' || this.peek().value === '/' || this.peek().value === '%')
    ) {
      const t = this.next();
      const right = this.parseUnary();
      left = { kind: 'binary', op: t.value, left, right, line: t.line };
    }
    return left;
  }

  private parseUnary(): Expr {
    if (
      this.is('keyword', 'not') ||
      this.is('op', '-') ||
      this.is('op', '#')
    ) {
      const t = this.next();
      const arg = this.parseUnary();
      return { kind: 'unary', op: t.value, arg, line: t.line };
    }
    return this.parsePower();
  }

  private parsePower(): Expr {
    const left = this.parseSuffixedExpr();
    if (this.is('op', '^')) {
      const t = this.next();
      const right = this.parseUnary();
      return { kind: 'binary', op: '^', left, right, line: t.line };
    }
    return left;
  }

  private parseSuffixedExpr(): Expr {
    let expr = this.parsePrimary();
    while (true) {
      if (this.is('punct', '.')) {
        const t = this.next();
        const propTok = this.peek();
        if (propTok.type !== 'ident' && propTok.type !== 'keyword') {
          throw new CottonLuaSyntaxError('Özellik adı bekleniyor', propTok.line, propTok.col);
        }
        this.next();
        expr = { kind: 'member', obj: expr, prop: propTok.value, line: t.line };
      } else if (this.is('punct', '[')) {
        const t = this.next();
        const key = this.parseExpr();
        this.expect('punct', ']', '"]" bekleniyor');
        expr = { kind: 'index', obj: expr, key, line: t.line };
      } else if (this.is('punct', ':')) {
        const t = this.next();
        const method = this.expect('ident', undefined, 'Metot adı bekleniyor').value;
        const args = this.parseCallArgs();
        expr = { kind: 'call', callee: expr, args, method, line: t.line };
      } else if (this.is('punct', '(') || this.is('punct', '{') || this.is('string')) {
        const t = this.peek();
        const args = this.parseCallArgs();
        expr = { kind: 'call', callee: expr, args, line: t.line };
      } else {
        break;
      }
    }
    return expr;
  }

  private parseCallArgs(): Expr[] {
    if (this.is('punct', '(')) {
      this.next();
      const args: Expr[] = [];
      if (!this.is('punct', ')')) {
        args.push(...this.parseExprList());
      }
      this.expect('punct', ')', '")" bekleniyor');
      return args;
    }
    if (this.is('punct', '{')) {
      return [this.parseTable()];
    }
    if (this.is('string')) {
      const t = this.next();
      return [{ kind: 'string', value: t.value }];
    }
    throw new CottonLuaSyntaxError('Fonksiyon argümanları bekleniyor', this.peek().line, this.peek().col);
  }

  private parsePrimary(): Expr {
    const t = this.peek();
    if (this.is('keyword', 'nil')) {
      this.next();
      return { kind: 'nil' };
    }
    if (this.is('keyword', 'true')) {
      this.next();
      return { kind: 'bool', value: true };
    }
    if (this.is('keyword', 'false')) {
      this.next();
      return { kind: 'bool', value: false };
    }
    if (t.type === 'number') {
      this.next();
      return { kind: 'number', value: Number(t.value) };
    }
    if (t.type === 'string') {
      this.next();
      return { kind: 'string', value: t.value };
    }
    if (t.type === 'ident') {
      this.next();
      return { kind: 'ident', name: t.value, line: t.line };
    }
    if (this.is('punct', '{')) {
      return this.parseTable();
    }
    if (this.is('keyword', 'function')) {
      this.next();
      const { params, body } = this.parseFuncBody();
      return { kind: 'func', params, body, line: t.line };
    }
    if (this.is('punct', '(')) {
      this.next();
      const e = this.parseExpr();
      this.expect('punct', ')', '")" bekleniyor');
      return e;
    }
    throw new CottonLuaSyntaxError(`Beklenmeyen ifade: "${t.value || t.type}"`, t.line, t.col);
  }

  private parseTable(): Expr {
    const start = this.expect('punct', '{');
    const fields: TableField[] = [];

    while (!this.is('eof') && !this.is('punct', '}')) {
      if (this.is('punct', ',') || this.is('punct', ';')) {
        this.next();
        continue;
      }

      // Support optional "local" inside Addthing{ ... } / thingTextures{ ... }
      if (this.is('keyword', 'local')) {
        this.next();
      }

      // Computed key: [expr] = val
      if (this.is('punct', '[')) {
        this.next();
        const keyExpr = this.parseExpr();
        this.expect('punct', ']', '"]" bekleniyor');
        this.expect('op', '=', '"=" bekleniyor');
        const value = this.parseExpr();
        fields.push({ keyExpr, value });
      } else if (this.peek().type === 'ident') {
        // Check for:
        // 1) ident { ... }  (sub-table shorthand: thingTextures{ ... })
        // 2) ident = expr
        // 3) ident1, ident2, ... = expr  (CottonLua multi-key comma assignment!)
        let look = 0;
        const candidateKeys: string[] = [];
        let matchedMultiAssign = false;
        let matchedSubTable = false;

        if (this.peek(1).type === 'punct' && this.peek(1).value === '{') {
          matchedSubTable = true;
        } else {
          while (this.peek(look).type === 'ident') {
            candidateKeys.push(this.peek(look).value);
            look++;
            if (this.peek(look).type === 'punct' && this.peek(look).value === ',') {
              look++;
              continue;
            }
            if (this.peek(look).type === 'op' && this.peek(look).value === '=') {
              matchedMultiAssign = true;
            }
            break;
          }
        }

        if (matchedSubTable) {
          const keyName = this.next().value;
          const value = this.parseTable();
          fields.push({ keys: [keyName], value });
        } else if (matchedMultiAssign && candidateKeys.length >= 1) {
          this.pos += look + 1; // consume keys + '='
          const value = this.parseExpr();
          fields.push({ keys: candidateKeys, value });
        } else {
          const value = this.parseExpr();
          fields.push({ value });
        }
      } else {
        const value = this.parseExpr();
        fields.push({ value });
      }

      if (this.is('punct', ',') || this.is('punct', ';')) {
        this.next();
      }
    }

    this.expect('punct', '}', '"}" kapanışı bekleniyor');
    return { kind: 'table', fields, line: start.line };
  }
}

// ===================== SANDBOXED VM =====================
export type LuaFnValue = ((...args: unknown[]) => unknown) & { __isLuaFn?: true };

class ReturnSignal {
  values: unknown[];
  constructor(values: unknown[]) {
    this.values = values;
  }
}

class BreakSignal {}

class EnvScope {
  vars: Record<string, unknown> = Object.create(null);
  parent: EnvScope | null;
  constructor(parent: EnvScope | null = null) {
    this.parent = parent;
  }
  get(name: string): unknown {
    if (name in this.vars) return this.vars[name];
    if (this.parent) return this.parent.get(name);
    return undefined;
  }
  set(name: string, val: unknown) {
    if (name in this.vars || !this.parent) {
      this.vars[name] = val;
      return;
    }
    let cur: EnvScope | null = this.parent;
    while (cur) {
      if (name in cur.vars) {
        cur.vars[name] = val;
        return;
      }
      cur = cur.parent;
    }
    this.vars[name] = val;
  }
  defineLocal(name: string, val: unknown) {
    this.vars[name] = val;
  }
}

function isTruthy(val: unknown): boolean {
  return val !== undefined && val !== null && val !== false;
}

class CottonLuaVM {
  steps = 0;
  readonly maxSteps: number;
  rootEnv: EnvScope;

  constructor(rootEnv: EnvScope, maxSteps = 60000) {
    this.rootEnv = rootEnv;
    this.maxSteps = maxSteps;
  }

  private tick() {
    this.steps++;
    if (this.steps > this.maxSteps) {
      throw new Error('Çalıştırma limiti aşıldı (sonsuz döngü koruması).');
    }
  }

  execBlock(stmts: Stmt[], env: EnvScope) {
    for (const st of stmts) {
      this.execStmt(st, env);
    }
  }

  private execStmt(st: Stmt, env: EnvScope) {
    this.tick();
    switch (st.kind) {
      case 'local': {
        const vals = st.values.map((v) => this.evalExpr(v, env));
        st.names.forEach((name, idx) => {
          env.defineLocal(name, vals[idx]);
        });
        break;
      }
      case 'assign': {
        const vals = st.values.map((v) => this.evalExpr(v, env));
        st.targets.forEach((tgt, idx) => {
          const v = vals[idx];
          if (tgt.kind === 'ident') {
            env.set(tgt.name, v);
          } else if (tgt.kind === 'member') {
            const obj = this.evalExpr(tgt.obj, env);
            if (obj && typeof obj === 'object') {
              (obj as Record<string, unknown>)[tgt.prop] = v;
            }
          } else if (tgt.kind === 'index') {
            const obj = this.evalExpr(tgt.obj, env);
            const k = this.evalExpr(tgt.key, env);
            this.setTableKey(obj, k, v);
          }
        });
        break;
      }
      case 'expr': {
        this.evalExpr(st.expr, env);
        break;
      }
      case 'funcDecl': {
        const params = st.isMethod ? ['self', ...st.params] : st.params;
        const fn = this.makeLuaFn(params, st.body, env);
        if (st.isLocal) {
          env.defineLocal(st.path[0], fn);
        } else if (st.path.length === 1) {
          env.set(st.path[0], fn);
        } else {
          let cur: unknown = env.get(st.path[0]);
          for (let i = 1; i < st.path.length - 1; i++) {
            if (!cur || typeof cur !== 'object') {
              cur = {};
            }
            cur = (cur as Record<string, unknown>)[st.path[i]];
          }
          if (cur && typeof cur === 'object') {
            (cur as Record<string, unknown>)[st.path[st.path.length - 1]] = fn;
          }
        }
        break;
      }
      case 'if': {
        for (const b of st.branches) {
          if (isTruthy(this.evalExpr(b.cond, env))) {
            this.execBlock(b.body, new EnvScope(env));
            return;
          }
        }
        if (st.elseBody) {
          this.execBlock(st.elseBody, new EnvScope(env));
        }
        break;
      }
      case 'forNum': {
        const start = Number(this.evalExpr(st.start, env));
        const end = Number(this.evalExpr(st.end, env));
        const step = st.step ? Number(this.evalExpr(st.step, env)) : 1;
        if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(step) || step === 0) break;
        for (let i = start; step > 0 ? i <= end : i >= end; i += step) {
          this.tick();
          const loopEnv = new EnvScope(env);
          loopEnv.defineLocal(st.varName, i);
          try {
            this.execBlock(st.body, loopEnv);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            throw e;
          }
        }
        break;
      }
      case 'forIn': {
        const iterVal = this.evalExpr(st.iter, env);
        const entries: [unknown, unknown][] = [];
        if (Array.isArray(iterVal)) {
          iterVal.forEach((v, idx) => entries.push([idx + 1, v]));
        } else if (iterVal && typeof iterVal === 'object') {
          Object.entries(iterVal as Record<string, unknown>).forEach(([k, v]) => {
            entries.push([k, v]);
          });
        }
        for (const [k, v] of entries) {
          this.tick();
          const loopEnv = new EnvScope(env);
          if (st.names.length >= 1) loopEnv.defineLocal(st.names[0], k);
          if (st.names.length >= 2) loopEnv.defineLocal(st.names[1], v);
          try {
            this.execBlock(st.body, loopEnv);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            throw e;
          }
        }
        break;
      }
      case 'while': {
        while (isTruthy(this.evalExpr(st.cond, env))) {
          this.tick();
          try {
            this.execBlock(st.body, new EnvScope(env));
          } catch (e) {
            if (e instanceof BreakSignal) break;
            throw e;
          }
        }
        break;
      }
      case 'repeat': {
        do {
          this.tick();
          const loopEnv = new EnvScope(env);
          try {
            this.execBlock(st.body, loopEnv);
          } catch (e) {
            if (e instanceof BreakSignal) break;
            throw e;
          }
          if (isTruthy(this.evalExpr(st.cond, loopEnv))) break;
        } while (true);
        break;
      }
      case 'return': {
        const vals = st.values.map((v) => this.evalExpr(v, env));
        throw new ReturnSignal(vals);
      }
      case 'break': {
        throw new BreakSignal();
      }
    }
  }

  private setTableKey(obj: unknown, key: unknown, val: unknown) {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj) && typeof key === 'number' && Number.isInteger(key) && key >= 1) {
      obj[key - 1] = val;
    } else {
      (obj as Record<string, unknown>)[String(key)] = val;
    }
  }

  private getTableKey(obj: unknown, key: unknown): unknown {
    if (!obj || typeof obj !== 'object') return undefined;
    if (Array.isArray(obj) && typeof key === 'number' && Number.isInteger(key) && key >= 1) {
      return obj[key - 1];
    }
    return (obj as Record<string, unknown>)[String(key)];
  }

  private makeLuaFn(params: string[], body: Stmt[], closureEnv: EnvScope): LuaFnValue {
    const fn: LuaFnValue = (...args: unknown[]) => {
      const callEnv = new EnvScope(closureEnv);
      params.forEach((p, idx) => callEnv.defineLocal(p, args[idx]));
      try {
        this.execBlock(body, callEnv);
      } catch (sig) {
        if (sig instanceof ReturnSignal) {
          return sig.values[0];
        }
        throw sig;
      }
      return undefined;
    };
    fn.__isLuaFn = true;
    return fn;
  }

  evalExpr(e: Expr, env: EnvScope): unknown {
    this.tick();
    switch (e.kind) {
      case 'nil':
        return undefined;
      case 'bool':
        return e.value;
      case 'number':
        return e.value;
      case 'string':
        return e.value;
      case 'ident':
        return env.get(e.name);
      case 'func':
        return this.makeLuaFn(e.params, e.body, env);
      case 'table': {
        const hasNamedKeys = e.fields.some((f) => f.keys || f.keyExpr);
        const obj: Record<string, unknown> = {};
        const arr: unknown[] = [];
        let arrIdx = 1;
        for (const f of e.fields) {
          let val = this.evalExpr(f.value, env);
          if (
            val === undefined &&
            f.value.kind === 'ident' &&
            f.keys?.some(
              (k) =>
                k === 'achievementCode' ||
                k === 'code' ||
                k === 'thingCode' ||
                k === 'tier' ||
                k === 'category',
            )
          ) {
            val = f.value.name;
          }
          if (f.keys) {
            for (const k of f.keys) {
              obj[k] = val;
            }
          } else if (f.keyExpr) {
            const k = this.evalExpr(f.keyExpr, env);
            obj[String(k)] = val;
          } else {
            arr.push(val);
            obj[String(arrIdx)] = val;
            arrIdx++;
          }
        }
        if (!hasNamedKeys) {
          return arr;
        }
        if (arr.length > 0) {
          obj.__array = arr;
        }
        return obj;
      }
      case 'unary': {
        const v = this.evalExpr(e.arg, env);
        if (e.op === 'not') return !isTruthy(v);
        if (e.op === '-') return -Number(v);
        if (e.op === '#') {
          if (Array.isArray(v)) return v.length;
          if (typeof v === 'string') return v.length;
          if (v && typeof v === 'object') {
            const arr = (v as Record<string, unknown>).__array;
            if (Array.isArray(arr)) return arr.length;
            return Object.keys(v as object).length;
          }
          return 0;
        }
        return undefined;
      }
      case 'binary': {
        if (e.op === 'and') {
          const l = this.evalExpr(e.left, env);
          return isTruthy(l) ? this.evalExpr(e.right, env) : l;
        }
        if (e.op === 'or') {
          const l = this.evalExpr(e.left, env);
          return isTruthy(l) ? l : this.evalExpr(e.right, env);
        }
        const l = this.evalExpr(e.left, env);
        const r = this.evalExpr(e.right, env);
        switch (e.op) {
          case '+':
            return Number(l) + Number(r);
          case '-':
            return Number(l) - Number(r);
          case '*':
            return Number(l) * Number(r);
          case '/':
            return Number(l) / Number(r);
          case '%':
            return Number(l) % Number(r);
          case '^':
            return Math.pow(Number(l), Number(r));
          case '..':
            return `${l ?? ''}${r ?? ''}`;
          case '==':
            return l === r;
          case '~=':
          case '!=':
            return l !== r;
          case '<':
            return Number(l) < Number(r);
          case '<=':
            return Number(l) <= Number(r);
          case '>':
            return Number(l) > Number(r);
          case '>=':
            return Number(l) >= Number(r);
        }
        return undefined;
      }
      case 'member': {
        const obj = this.evalExpr(e.obj, env);
        if (obj && typeof obj === 'object') {
          return (obj as Record<string, unknown>)[e.prop];
        }
        return undefined;
      }
      case 'index': {
        const obj = this.evalExpr(e.obj, env);
        const key = this.evalExpr(e.key, env);
        return this.getTableKey(obj, key);
      }
      case 'call': {
        const args = e.args.map((a) => this.evalExpr(a, env));
        const isAchCall =
          (e.callee.kind === 'ident' && e.callee.name === 'achievementTake') ||
          (e.callee.kind === 'member' && e.callee.prop === 'achievementTake');
        if (isAchCall && args[0] === undefined && e.args[0]?.kind === 'ident') {
          args[0] = e.args[0].name;
        }
        if (e.method) {
          const obj = this.evalExpr(e.callee, env);
          const fn =
            obj && typeof obj === 'object'
              ? (obj as Record<string, unknown>)[e.method]
              : undefined;
          if (typeof fn !== 'function') {
            throw new Error(`Satır ${e.line}: "${e.method}" metodu bulunamadı.`);
          }
          return (fn as (...a: unknown[]) => unknown)(obj, ...args);
        } else {
          const fn = this.evalExpr(e.callee, env);
          if (typeof fn !== 'function') {
            const label =
              e.callee.kind === 'ident'
                ? e.callee.name
                : e.callee.kind === 'member'
                  ? e.callee.prop
                  : 'ifade';
            throw new Error(`Satır ${e.line}: "${label}" çağrılabilir bir fonksiyon değil.`);
          }
          return (fn as (...a: unknown[]) => unknown)(...args);
        }
      }
    }
  }
}

// ===================== COMPILER & HELPERS =====================
export interface CompileCottonLuaOptions {
  modId: string;
  modName?: string;
  modVersion?: string;
  modDescription?: string;
  pngTextures?: Record<string, string>;
  models3d?: Record<string, CustomModel3D>;
  availableMods?: ModDefinition[];
}

function slugify(str: string): string {
  return (str || 'item')
    .toLowerCase()
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 26);
}

function normalizePattern(style: string): BlockPattern {
  const map: Record<string, BlockPattern> = {
    normalBlock: 'solid',
    solid: 'solid',
    glowBlock: 'glow',
    glow: 'glow',
    glassBlock: 'glass',
    glass: 'glass',
    oreBlock: 'ore',
    ore: 'ore',
    brickBlock: 'brick',
    brick: 'brick',
    plankBlock: 'plank',
    plank: 'plank',
    logBlock: 'log',
    log: 'log',
    leavesBlock: 'leaves',
    leaves: 'leaves',
    tileBlock: 'tile',
    tile: 'tile',
    metalBlock: 'metal_block',
    metal_block: 'metal_block',
    woolBlock: 'wool',
    wool: 'wool',
    crossBlock: 'foliage_cross',
    foliage_cross: 'foliage_cross',
    lanternBlock: 'lantern',
    lantern: 'lantern',
    torch: 'torch',
    cobble: 'cobble',
    stone: 'stone',
    dirt: 'dirt',
    sand: 'sand',
    grass_top: 'grass_top',
    pillar: 'pillar',
    chiseled: 'chiseled',
    cracked: 'cracked',
    mossy: 'mossy',
    terracotta: 'terracotta',
    concrete: 'concrete',
    magma: 'magma',
    prismarine: 'prismarine',
    netherrack: 'netherrack',
    water: 'water',
    waterBlock: 'water',
    liquidBlock: 'water',
    lava: 'lava',
    lavaBlock: 'lava',
  };
  return map[style] || 'solid';
}

function toTableArray(val: unknown): unknown[] {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    if (Array.isArray(obj.__array)) return obj.__array;
    const keys = Object.keys(obj)
      .filter((k) => /^\d+$/.test(k))
      .sort((a, b) => Number(a) - Number(b));
    return keys.map((k) => obj[k]);
  }
  return [];
}

function parseCuboidModel(raw: unknown): CustomModel3D | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  if (Array.isArray(obj.parts)) {
    return raw as CustomModel3D;
  }
  const arr = toTableArray(raw);
  if (arr.length === 0) return undefined;
  const parts: CuboidPart[] = [];
  arr.forEach((entry, idx) => {
    if (!entry || typeof entry !== 'object') return;
    const p = entry as Record<string, unknown>;
    parts.push({
      id: String(p.id || `part_${idx + 1}`),
      name: String(p.name || `Parça ${idx + 1}`),
      x: Number(p.x ?? 0),
      y: Number(p.y ?? 0),
      z: Number(p.z ?? 0),
      w: Math.max(0.5, Number(p.w ?? 4)),
      h: Math.max(0.5, Number(p.h ?? 4)),
      d: Math.max(0.5, Number(p.d ?? 4)),
      color: String(p.color || '#38bdf8'),
      rotX: Number(p.rotX ?? 0),
      rotY: Number(p.rotY ?? 0),
      rotZ: Number(p.rotZ ?? 0),
    });
  });
  return parts.length > 0 ? { parts } : undefined;
}

function parseAnimation(raw: unknown): AnimationConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const a = raw as Record<string, unknown>;
  const valid: AnimationStyle[] = ['swing', 'recoil', 'spin', 'pulse', 'thrust', 'hover'];
  const style = valid.includes(a.style as AnimationStyle) ? (a.style as AnimationStyle) : 'swing';
  return {
    style,
    speed: Math.max(0.2, Math.min(8, Number(a.speed ?? 1.5))),
    amplitude: Math.max(0.1, Math.min(4, Number(a.amplitude ?? 1))),
    recoil: Number(a.recoil ?? 0.4),
    bob: Number(a.bob ?? 0),
  };
}

function parseWeapon(raw: unknown, fallbackKind: WeaponKind = 'melee'): WeaponSpec | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const w = raw as Record<string, unknown>;
  const validKinds: WeaponKind[] = ['melee', 'gun', 'bow', 'staff'];
  const wk = validKinds.includes(w.weaponKind as WeaponKind)
    ? (w.weaponKind as WeaponKind)
    : fallbackKind;
  return {
    weaponKind: wk,
    damage: Math.max(1, Number(w.damage ?? 8)),
    cooldown: Math.max(0.06, Number(w.cooldown ?? 0.25)),
    range: Math.max(2, Number(w.range ?? (wk === 'melee' ? 5 : 42))),
    projectileSpeed: Number(w.projectileSpeed ?? 38),
    projectileColor: String(w.projectileColor || '#38bdf8'),
    explosionPower: Number(w.explosionPower ?? 0),
    lightning: Boolean(w.lightning),
    knockback: Number(w.knockback ?? 4),
    burstCount: Math.max(1, Math.min(8, Number(w.burstCount ?? 1))),
    spread: Number(w.spread ?? 0.02),
  };
}

function parseRecipePattern(raw: unknown): (string | null)[] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (r.pattern) {
    const arr = toTableArray(r.pattern).slice(0, 9);
    while (arr.length < 9) arr.push(null);
    return arr.map((v) => (v && v !== 'air' && v !== '' ? String(v) : null));
  }
  if (r.shape && r.keys && typeof r.keys === 'object') {
    const rows = toTableArray(r.shape).slice(0, 3);
    const keyMap = r.keys as Record<string, unknown>;
    const pat: (string | null)[] = Array(9).fill(null);
    for (let row = 0; row < rows.length; row++) {
      const rowStr = String(rows[row] || '');
      for (let col = 0; col < Math.min(3, rowStr.length); col++) {
        const ch = rowStr[col];
        if (ch !== ' ' && keyMap[ch]) {
          pat[row * 3 + col] = String(keyMap[ch]);
        }
      }
    }
    return pat;
  }
  return undefined;
}

function buildModProxy(
  targetMod: ModDefinition,
  activeBridgeRef: { current: CottonLuaWorldBridge | null },
  extraPrints: string[],
): Record<string, unknown> {
  const assetLookup = new Map<string, unknown>();
  if (targetMod.pngTextures) {
    Object.entries(targetMod.pngTextures).forEach(([k, v]) => assetLookup.set(k, v));
  }
  if (targetMod.assets) {
    Object.entries(targetMod.assets).forEach(([k, v]) => assetLookup.set(k, v));
  }
  if (targetMod.models3d) {
    Object.entries(targetMod.models3d).forEach(([k, v]) => assetLookup.set(k, v));
  }
  targetMod.blocks?.forEach((b) => {
    if (b.customTexture) assetLookup.set(b.name, b.customTexture);
    assetLookup.set(b.id, b.customTexture || b.color);
  });
  targetMod.items?.forEach((it) => {
    if (it.customTexture) assetLookup.set(it.name, it.customTexture);
  });

  const base: Record<string, unknown> = {
    __modId: targetMod.id,
    id: targetMod.id,
    name: targetMod.name,
    version: targetMod.version,
    child: (name: unknown) => {
      const key = String(name ?? '');
      return assetLookup.get(key) ?? assetLookup.get(key.trim()) ?? undefined;
    },
    asset: (name: unknown) => {
      const key = String(name ?? '');
      return assetLookup.get(key) ?? undefined;
    },
  };

  // Attach native runtime implementations for Official Built-in APIs
  if (targetMod.id === 'api_animation_config') {
    base.create = (style = 'swing', speed = 1.4, amplitude = 1.0, recoil = 0.45) => ({
      style: String(style),
      speed: Number(speed),
      amplitude: Number(amplitude),
      recoil: Number(recoil),
    });
    base.recoilPreset = (power = 1.0) => ({
      style: 'recoil',
      speed: 2.8,
      amplitude: Number(power),
      recoil: Number(power) * 0.9,
    });
    base.swordSlashPreset = (speed = 2.0) => ({
      style: 'swing',
      speed: Number(speed),
      amplitude: 1.35,
      recoil: 0.15,
    });
    base.magicFloatPreset = () => ({
      style: 'hover',
      speed: 1.8,
      amplitude: 0.9,
      recoil: 0.2,
    });
    base.spinPreset = (speed = 3.0) => ({
      style: 'spin',
      speed: Number(speed),
      amplitude: 1.0,
      recoil: 0,
    });
  } else if (targetMod.id === 'api_world_builder') {
    const getB = (worldArg: unknown): CottonLuaWorldBridge | null =>
      (worldArg && typeof (worldArg as CottonLuaWorldBridge).setBlock === 'function'
        ? (worldArg as CottonLuaWorldBridge)
        : activeBridgeRef.current);

    base.placeRelative = (w: unknown, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, blk: string) => {
      getB(w)?.setBlock(Number(ox) + Number(dx), Number(oy) + Number(dy), Number(oz) + Number(dz), String(blk));
    };
    base.fillBox = (w: unknown, ox: number, oy: number, oz: number, x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, blk: string) => {
      const b = getB(w);
      if (!b) return;
      const minX = Number(ox) + Math.min(Number(x1), Number(x2));
      const maxX = Number(ox) + Math.max(Number(x1), Number(x2));
      const minY = Number(oy) + Math.min(Number(y1), Number(y2));
      const maxY = Number(oy) + Math.max(Number(y1), Number(y2));
      const minZ = Number(oz) + Math.min(Number(z1), Number(z2));
      const maxZ = Number(oz) + Math.max(Number(z1), Number(z2));
      b.fill(minX, minY, minZ, maxX, maxY, maxZ, String(blk));
    };
    base.hollowBox = (w: unknown, ox: number, oy: number, oz: number, width = 5, height = 4, depth = 5, wallBlock = 'oak_planks', floorBlock?: string) => {
      const b = getB(w);
      if (!b) return;
      const hw = Math.floor(Number(width) / 2);
      const hd = Math.floor(Number(depth) / 2);
      const h = Math.max(3, Math.min(18, Number(height)));
      const wall = String(wallBlock || 'oak_planks');
      const floor = String(floorBlock || wall);
      for (let dy = 0; dy < h; dy++) {
        for (let dx = -hw; dx <= hw; dx++) {
          for (let dz = -hd; dz <= hd; dz++) {
            const isWall = dx === -hw || dx === hw || dz === -hd || dz === hd || dy === h - 1;
            if (dy === 0) {
              b.setBlock(Number(ox) + dx, Number(oy) + dy, Number(oz) + dz, floor);
            } else if (isWall) {
              if (!(dz === hd && dx === 0 && (dy === 1 || dy === 2))) {
                b.setBlock(Number(ox) + dx, Number(oy) + dy, Number(oz) + dz, wall);
              } else {
                b.setBlock(Number(ox) + dx, Number(oy) + dy, Number(oz) + dz, 'air');
              }
            } else {
              b.setBlock(Number(ox) + dx, Number(oy) + dy, Number(oz) + dz, 'air');
            }
          }
        }
      }
    };
    base.pillar = (w: unknown, ox: number, oy: number, oz: number, dx: number, dz: number, height: number, blk: string) => {
      const b = getB(w);
      if (!b) return;
      for (let y = 0; y < Math.min(40, Number(height)); y++) {
        b.setBlock(Number(ox) + Number(dx), Number(oy) + y, Number(oz) + Number(dz), String(blk));
      }
    };
    base.sphere = (w: unknown, cx: number, cy: number, cz: number, radius = 3, blk = 'stone') => {
      const b = getB(w);
      if (!b) return;
      const r = Math.min(10, Math.max(1, Math.round(Number(radius))));
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dz = -r; dz <= r; dz++) {
            if (dx * dx + dy * dy + dz * dz <= r * r + 0.4) {
              b.setBlock(Number(cx) + dx, Number(cy) + dy, Number(cz) + dz, String(blk));
            }
          }
        }
      }
    };
    base.tower = (w: unknown, ox: number, oy: number, oz: number, radius = 3, height = 9, wallBlock = 'stone_bricks', lightBlock = 'glowstone') => {
      const b = getB(w);
      if (!b) return;
      const r = Math.min(8, Math.max(2, Number(radius)));
      const h = Math.min(28, Math.max(4, Number(height)));
      for (let dy = 0; dy < h; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          for (let dz = -r; dz <= r; dz++) {
            const dist = Math.hypot(dx, dz);
            if (dy === 0 || dy === h - 1) {
              if (dist <= r + 0.25) {
                b.setBlock(Number(ox) + dx, Number(oy) + dy, Number(oz) + dz, String(wallBlock));
              }
            } else if (dist >= r - 0.8 && dist <= r + 0.25) {
              if (!(dz >= r - 1 && dx === 0 && (dy === 1 || dy === 2))) {
                b.setBlock(Number(ox) + dx, Number(oy) + dy, Number(oz) + dz, dy % 4 === 2 && Math.abs(dx) === r ? String(lightBlock) : String(wallBlock));
              }
            }
          }
        }
      }
    };
    base.buildSchematic = (w: unknown, ox: number, oy: number, oz: number, list: unknown) => {
      const b = getB(w);
      if (!b) return;
      const items = toTableArray(list);
      for (const it of items) {
        if (it && typeof it === 'object') {
          const rec = it as Record<string, unknown>;
          if (rec.block) {
            b.setBlock(
              Number(ox) + Number(rec.dx ?? 0),
              Number(oy) + Number(rec.dy ?? 0),
              Number(oz) + Number(rec.dz ?? 0),
              String(rec.block),
            );
          }
        }
      }
    };
  } else if (targetMod.id === 'api_weapon_forge') {
    base.gun = (opts: Record<string, unknown> = {}) => ({
      weaponKind: 'gun',
      damage: Number(opts.damage ?? 8),
      cooldown: Number(opts.cooldown ?? 0.22),
      range: Number(opts.range ?? 48),
      projectileSpeed: Number(opts.projectileSpeed ?? 42),
      projectileColor: String(opts.projectileColor || '#38bdf8'),
      explosionPower: Number(opts.explosionPower ?? 0),
      lightning: Boolean(opts.lightning),
      knockback: Number(opts.knockback ?? 4),
      burstCount: Number(opts.burstCount ?? 1),
      spread: Number(opts.spread ?? 0.02),
    });
    base.staff = (opts: Record<string, unknown> = {}) => ({
      weaponKind: 'staff',
      damage: Number(opts.damage ?? 12),
      cooldown: Number(opts.cooldown ?? 0.45),
      range: Number(opts.range ?? 40),
      projectileSpeed: Number(opts.projectileSpeed ?? 32),
      projectileColor: String(opts.projectileColor || '#c084fc'),
      explosionPower: Number(opts.explosionPower ?? 2.2),
      lightning: opts.lightning !== false,
      knockback: Number(opts.knockback ?? 6),
      burstCount: Number(opts.burstCount ?? 1),
      spread: Number(opts.spread ?? 0.01),
    });
    base.sword = (opts: Record<string, unknown> = {}) => ({
      weaponKind: 'melee',
      damage: Number(opts.damage ?? 10),
      cooldown: Number(opts.cooldown ?? 0.25),
      range: Number(opts.range ?? 5),
      knockback: Number(opts.knockback ?? 5),
    });
    base.explode = (w: unknown, x: number, y: number, z: number, radius = 2.5) => {
      const b = (w && typeof (w as CottonLuaWorldBridge).explode === 'function'
        ? (w as CottonLuaWorldBridge)
        : activeBridgeRef.current);
      b?.explode(Number(x), Number(y), Number(z), Number(radius));
    };
  } else if (targetMod.id === 'api_particle_fx') {
    const getB = (w: unknown) =>
      (w && typeof (w as CottonLuaWorldBridge).spawnParticles === 'function'
        ? (w as CottonLuaWorldBridge)
        : activeBridgeRef.current);
    base.burst = (w: unknown, x: number, y: number, z: number, color = '#fbbf24', count = 12) => {
      getB(w)?.spawnParticles(Number(x), Number(y), Number(z), String(color), Number(count));
    };
    base.hearts = (w: unknown, x: number, y: number, z: number, count = 6) => {
      getB(w)?.spawnHearts(Number(x), Number(y), Number(z), Number(count));
    };
    base.lightning = (w: unknown, x: number, y: number, z: number, color = '#38bdf8') => {
      getB(w)?.spawnLightning(Number(x), Number(y), Number(z), String(color));
    };
    base.ring = (w: unknown, x: number, y: number, z: number, radius = 2.5, color = '#22d3ee', points = 10) => {
      const b = getB(w);
      if (!b) return;
      const r = Number(radius);
      const n = Math.min(24, Math.max(4, Number(points)));
      for (let i = 1; i <= n; i++) {
        const a = (i / n) * Math.PI * 2;
        b.spawnParticles(Number(x) + Math.cos(a) * r, Number(y) + 0.3, Number(z) + Math.sin(a) * r, String(color), 2);
      }
    };
  } else if (targetMod.id === 'api_entity_control') {
    base.spawnMob = (w: unknown, kind = 'cow', x: number, y: number, z: number, isBaby = false) => {
      const b = (w && typeof (w as CottonLuaWorldBridge).spawnMob === 'function'
        ? (w as CottonLuaWorldBridge)
        : activeBridgeRef.current);
      b?.spawnMob(String(kind), Number(x), Number(y), Number(z), Boolean(isBaby));
    };
    base.healPlayer = (_ctx: unknown, amount = 10) => {
      activeBridgeRef.current?.healPlayer(Number(amount));
    };
    base.launchPlayer = (_ctx: unknown, vx = 0, vy = 12, vz = 0) => {
      activeBridgeRef.current?.launchPlayer(Number(vx), Number(vy), Number(vz));
    };
    base.teleportPlayer = (_ctx: unknown, x: number, y: number, z: number) => {
      activeBridgeRef.current?.teleportPlayer(Number(x), Number(y), Number(z));
    };
    base.give = (_ctx: unknown, itemId: string, count = 1) => {
      activeBridgeRef.current?.giveItem(String(itemId), Number(count));
    };
    base.say = (_ctx: unknown, text: string) => {
      const msg = String(text);
      if (activeBridgeRef.current) activeBridgeRef.current.say(msg);
      else extraPrints.push(msg);
    };
  }

  return base;
}

export function compileCottonLuaMod(
  source: string,
  options: CompileCottonLuaOptions,
): CompiledCottonLuaResult {
  const logs: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];
  const blocks: ModBlockSpec[] = [];
  const items: ModItemSpec[] = [];
  const tools: ModToolSpec[] = [];
  const recipes: ModRecipeSpec[] = [];
  const commands: ModCommandSpec[] = [];
  const achievements: AchievementDef[] = [];
  const itemHooks = new Map<string, CottonLuaItemHooks>();
  const commandHandlers = new Map<string, LuaFnValue>();
  const worldTickHooks: LuaFnValue[] = [];
  const dependencies = new Set<string>();

  const activeBridgeRef: { current: CottonLuaWorldBridge | null } = { current: null };

  const allAvailableMods = new Map<string, ModDefinition>();
  BUILTIN_API_ENTRIES.forEach((entry) => allAvailableMods.set(entry.mod.id, entry.mod));
  (options.availableMods || []).forEach((m) => allAvailableMods.set(m.id, m));

  const env = new EnvScope(null);

  // Bare enum constants so Addthing{ local thingType = block, local thingStyle = normalBlock } works naturally
  const bareEnums = [
    'block',
    'item',
    'food',
    'material',
    'gem',
    'tool',
    'weapon',
    'gun',
    'sword',
    'bow',
    'staff',
    'pickaxe',
    'axe',
    'shovel',
    'none',
    'recipe',
    'furnace',
    'command',
    'structure',
    'normalBlock',
    'customModel',
    'glowBlock',
    'glassBlock',
    'oreBlock',
    'crossBlock',
    'lanternBlock',
    'metalBlock',
    'brickBlock',
    'plankBlock',
    'logBlock',
    'tileBlock',
    'woolBlock',
    'solid',
    'ore',
    'brick',
    'plank',
    'log',
    'leaves',
    'glass',
    'tile',
    'glow',
    'wool',
    'metal_block',
    'lantern',
    'torch',
    'swing',
    'recoil',
    'spin',
    'pulse',
    'thrust',
    'hover',
    'cow',
    'pig',
    'sheep',
    'achievement',
    'basarim',
    'bronze',
    'silver',
    'gold',
    'diamond',
    'liquid',
    'fluid',
    'sivi',
    'bucket',
    'water',
    'lava',
    'waterBlock',
    'lavaBlock',
    'fast',
    'medium',
    'slow',
  ];
  bareEnums.forEach((e) => env.defineLocal(e, e));

  const triggerAchievementTake = (
    codeOrSelf: unknown,
    amountOrCode?: unknown,
    maybeAmount?: unknown,
  ) => {
    let rawCode = codeOrSelf;
    let rawAmt = amountOrCode;
    if (rawCode && typeof rawCode === 'object') {
      rawCode = amountOrCode;
      rawAmt = maybeAmount;
    }
    const codeStr = String(rawCode ?? '').trim();
    if (!codeStr) return;
    const amt = rawAmt === undefined ? 1 : Math.max(1, Math.floor(Number(rawAmt) || 1));
    activeBridgeRef.current?.triggerAchievement(codeStr, amt);
  };

  // World proxy: accessed both at top level (`local world = script.parent`) and inside runtime hooks
  const worldProxy = {
    getBlock: (x: number, y: number, z: number) =>
      activeBridgeRef.current?.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) ?? 'air',
    setBlock: (x: number, y: number, z: number, id: string) =>
      activeBridgeRef.current?.setBlock(Math.floor(x), Math.floor(y), Math.floor(z), String(id)),
    setBlockRel: (ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, id: string) =>
      activeBridgeRef.current?.setBlock(
        Math.floor(Number(ox) + Number(dx)),
        Math.floor(Number(oy) + Number(dy)),
        Math.floor(Number(oz) + Number(dz)),
        String(id),
      ),
    fill: (x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, id: string) =>
      activeBridgeRef.current?.fill(
        Math.floor(x1),
        Math.floor(y1),
        Math.floor(z1),
        Math.floor(x2),
        Math.floor(y2),
        Math.floor(z2),
        String(id),
      ),
    explode: (x: number, y: number, z: number, radius = 3) =>
      activeBridgeRef.current?.explode(Number(x), Number(y), Number(z), Number(radius)),
    spawnParticles: (x: number, y: number, z: number, color = '#fbbf24', count = 10) =>
      activeBridgeRef.current?.spawnParticles(Number(x), Number(y), Number(z), String(color), Number(count)),
    spawnHearts: (x: number, y: number, z: number, count = 5) =>
      activeBridgeRef.current?.spawnHearts(Number(x), Number(y), Number(z), Number(count)),
    spawnLightning: (x: number, y: number, z: number, color = '#38bdf8') =>
      activeBridgeRef.current?.spawnLightning(Number(x), Number(y), Number(z), String(color)),
    spawnMob: (kind: string, x: number, y: number, z: number, isBaby = false) =>
      activeBridgeRef.current?.spawnMob(String(kind), Number(x), Number(y), Number(z), Boolean(isBaby)),
    fireProjectile: (opts: Record<string, unknown> = {}) => {
      activeBridgeRef.current?.fireProjectile({
        x: Number(opts.x ?? 0),
        y: Number(opts.y ?? 0),
        z: Number(opts.z ?? 0),
        dx: Number(opts.dx ?? 0),
        dy: Number(opts.dy ?? 0),
        dz: Number(opts.dz ?? -1),
        speed: Number(opts.speed ?? 36),
        damage: Number(opts.damage ?? 8),
        color: String(opts.color || '#38bdf8'),
        explosionPower: Number(opts.explosionPower ?? 0),
        lightning: Boolean(opts.lightning),
        knockback: Number(opts.knockback ?? 4),
      });
    },
    getTime: () => activeBridgeRef.current?.getTime() ?? 4000,
    setTime: (t: number) => activeBridgeRef.current?.setTime(Number(t)),
    getPlayerPos: () => activeBridgeRef.current?.getPlayerPos() ?? { x: 0, y: 30, z: 0, yaw: 0, pitch: 0 },
    teleport: (x: number, y: number, z: number) =>
      activeBridgeRef.current?.teleportPlayer(Number(x), Number(y), Number(z)),
    launch: (vx: number, vy: number, vz: number) =>
      activeBridgeRef.current?.launchPlayer(Number(vx), Number(vy), Number(vz)),
    heal: (amount = 10) => activeBridgeRef.current?.healPlayer(Number(amount)),
    give: (itemId: string, count = 1) => activeBridgeRef.current?.giveItem(String(itemId), Number(count)),
    setGameMode: (gm: string) =>
      activeBridgeRef.current?.setGameMode(gm === 'creative' ? 'creative' : 'survival'),
    say: (text: string) => activeBridgeRef.current?.say(String(text)),
    playSound: (kind: string) => activeBridgeRef.current?.playSound(String(kind)),
    achievementTake: triggerAchievementTake,
  };

  env.defineLocal('script', { parent: worldProxy, modId: options.modId });
  env.defineLocal('world', worldProxy);
  env.defineLocal('achievementTake', triggerAchievementTake);

  // Current mod asset accessor (`mod.texture("...")`, `mod.model("...")`, `mod.child("...")`)
  const pngTextures = options.pngTextures || {};
  const models3d = options.models3d || {};
  env.defineLocal('mod', {
    id: options.modId,
    texture: (name: unknown) => pngTextures[String(name ?? '')],
    model: (name: unknown) => models3d[String(name ?? '')],
    child: (name: unknown) => {
      const k = String(name ?? '');
      return pngTextures[k] ?? models3d[k];
    },
  });

  // Dependency loader (strictly by published mod ID!)
  const resolveDepById = (rawId: unknown): Record<string, unknown> | undefined => {
    const idStr = String(rawId ?? '').trim();
    if (!idStr) return undefined;
    dependencies.add(idStr);
    const targetMod = allAvailableMods.get(idStr);
    if (!targetMod) {
      warnings.push(
        `Bağımlılık bulunamadı (ID: "${idStr}"). Topluluk Modları'ndan ilgili API veya modu kurduğundan emin ol.`,
      );
      return undefined;
    }
    return buildModProxy(targetMod, activeBridgeRef, logs);
  };

  env.defineLocal('requireMod', resolveDepById);
  env.defineLocal('GetMod', resolveDepById);

  // Pre-register built-in API proxies lazily so both `requireMod("api_...")` and direct API symbols work
  for (const entry of BUILTIN_API_ENTRIES) {
    const proxy = buildModProxy(entry.mod, activeBridgeRef, logs);
    for (const alias of entry.aliases) {
      env.defineLocal(alias, proxy);
    }
  }

  // Standard Lua stdlib
  env.defineLocal('math', {
    abs: Math.abs,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    sqrt: Math.sqrt,
    pow: Math.pow,
    min: Math.min,
    max: Math.max,
    random: (a?: number, b?: number) => {
      if (a === undefined) return Math.random();
      if (b === undefined) return Math.floor(Math.random() * Number(a)) + 1;
      return Math.floor(Math.random() * (Number(b) - Number(a) + 1)) + Number(a);
    },
    pi: Math.PI,
  });

  env.defineLocal('string', {
    lower: (s: unknown) => String(s ?? '').toLowerCase(),
    upper: (s: unknown) => String(s ?? '').toUpperCase(),
    len: (s: unknown) => String(s ?? '').length,
    sub: (s: unknown, i: number, j?: number) =>
      String(s ?? '').slice(Math.max(0, i - 1), j),
    format: (fmt: string, ...args: unknown[]) => {
      let idx = 0;
      return String(fmt).replace(/%[sdif]/g, () => String(args[idx++] ?? ''));
    },
  });

  env.defineLocal('table', {
    insert: (arr: unknown, val: unknown) => {
      if (Array.isArray(arr)) arr.push(val);
    },
    remove: (arr: unknown, idx?: number) => {
      if (Array.isArray(arr)) {
        if (idx === undefined) return arr.pop();
        return arr.splice(idx - 1, 1)[0];
      }
      return undefined;
    },
    concat: (arr: unknown, sep = '') =>
      Array.isArray(arr) ? arr.join(String(sep)) : '',
  });

  env.defineLocal('pairs', (t: unknown) => t);
  env.defineLocal('ipairs', (t: unknown) => toTableArray(t));
  env.defineLocal('tonumber', (v: unknown) => {
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  });
  env.defineLocal('tostring', (v: unknown) => String(v ?? 'nil'));
  env.defineLocal('type', (v: unknown) => {
    if (v === undefined || v === null) return 'nil';
    if (typeof v === 'boolean') return 'boolean';
    if (typeof v === 'number') return 'number';
    if (typeof v === 'string') return 'string';
    if (typeof v === 'function') return 'function';
    return 'table';
  });
  env.defineLocal('print', (...args: unknown[]) => {
    const line = args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a ?? 'nil'))).join(' ');
    logs.push(line);
  });

  env.defineLocal('onWorldTick', (fn: unknown) => {
    if (typeof fn === 'function') {
      worldTickHooks.push(fn as LuaFnValue);
    }
  });

  // Helper to resolve texture reference inside thingTextures / thingTexture
  const resolveTextureVal = (val: unknown): string | undefined => {
    if (!val || typeof val !== 'string') return undefined;
    if (val.startsWith('data:image')) return val;
    if (pngTextures[val]) return pngTextures[val];
    if (val.includes(',') && val.split(',').length === 256) return val;
    return undefined;
  };

  // AddCommand DSL
  const registerCommand = (raw: Record<string, unknown>) => {
    const rawCmd = String(raw.command || raw.name || '').trim().replace(/^\/+/, '').toLowerCase();
    const clean = rawCmd.replace(/[^a-z0-9_]/g, '');
    if (!clean) {
      warnings.push('AddCommand: Geçerli bir komut adı belirtilmedi.');
      return;
    }
    const id = String(raw.id || `lua_cmd_${slugify(options.modId)}_${clean}`);
    const desc = String(raw.description || raw.desc || `/${clean} CottonLua komutu`);
    const fn = typeof raw.run === 'function'
      ? raw.run
      : typeof raw.onRun === 'function'
        ? raw.onRun
        : typeof raw.handler === 'function'
          ? raw.handler
          : undefined;

    if (fn) {
      commandHandlers.set(clean, fn as LuaFnValue);
      commands.push({
        id,
        command: clean,
        description: desc,
        actionType: 'cottonlua',
      });
    } else {
      commands.push({
        id,
        command: clean,
        description: desc,
        actionType: (raw.actionType as ModCommandSpec['actionType']) || 'broadcast',
        itemId: raw.itemId ? String(raw.itemId) : undefined,
        itemCount: raw.itemCount ? Number(raw.itemCount) : undefined,
        messageText: raw.message ? String(raw.message) : desc,
      });
    }
  };
  env.defineLocal('AddCommand', (tbl: unknown) => {
    if (tbl && typeof tbl === 'object') registerCommand(tbl as Record<string, unknown>);
  });

  // Addthing{} DSL — The Heart of CottonLua!
  const registerThing = (raw: unknown) => {
    if (!raw || typeof raw !== 'object') {
      warnings.push('Addthing{}: Tablo bekleniyordu.');
      return;
    }
    const spec = raw as Record<string, unknown>;
    const rawType = String(spec.thingType || spec.type || 'block').toLowerCase();
    const name = String(spec.thingName || spec.name || 'Özel Öğe').trim();
    const id = String(
      spec.thingId ||
        spec.id ||
        `lua_${slugify(name)}_${blocks.length + items.length + tools.length + 1}`,
    );
    const style = String(spec.thingStyle || spec.style || 'normalBlock');
    const color = String(spec.thingColor || spec.color || '#38bdf8');
    const secondaryColor = String(spec.secondaryColor || spec.accentColor || '#0f172a');
    const anim = parseAnimation(spec.animation || spec.thingAnimation);

    // Resolve Custom 3D Model
    let customModel = parseCuboidModel(spec.thingModel || spec.model || spec.customModel);
    if (!customModel && typeof (spec.thingModel || spec.model) === 'string') {
      customModel = models3d[String(spec.thingModel || spec.model)];
    }

    // Collect runtime hooks if provided
    const hooks: CottonLuaItemHooks = {};
    if (typeof spec.onPlace === 'function') hooks.onPlace = spec.onPlace as LuaFnValue;
    if (typeof spec.onBreak === 'function') hooks.onBreak = spec.onBreak as LuaFnValue;
    if (typeof spec.onUse === 'function') hooks.onUse = spec.onUse as LuaFnValue;
    if (typeof spec.onAttack === 'function') hooks.onAttack = spec.onAttack as LuaFnValue;
    if (typeof spec.onTick === 'function') {
      hooks.onTick = spec.onTick as LuaFnValue;
      worldTickHooks.push(spec.onTick as LuaFnValue);
    }

    // Optional relative structure array on block placement (`structure = { {dx=0,dy=1,dz=0,block="stone"}, ... }`)
    if (!hooks.onPlace && spec.structure) {
      const structList = toTableArray(spec.structure);
      if (structList.length > 0) {
        const autoPlace: LuaFnValue = ((ctxObj: unknown) => {
          const ctx = ctxObj as CottonLuaHookContext;
          const b = activeBridgeRef.current;
          if (!b || !ctx) return;
          for (const entry of structList) {
            if (entry && typeof entry === 'object') {
              const r = entry as Record<string, unknown>;
              if (r.block) {
                b.setBlock(
                  ctx.x + Number(r.dx ?? 0),
                  ctx.y + Number(r.dy ?? 0),
                  ctx.z + Number(r.dz ?? 0),
                  String(r.block),
                );
              }
            }
          }
        }) as LuaFnValue;
        autoPlace.__isLuaFn = true;
        hooks.onPlace = autoPlace;
      }
    }

    if (hooks.onPlace || hooks.onBreak || hooks.onUse || hooks.onAttack || hooks.onTick) {
      itemHooks.set(id, hooks);
    }

    // 1. ACHIEVEMENT (Survival-only, Google cloud synced)
    if (rawType === 'achievement' || rawType === 'basarim') {
      const rawCode =
        String(
          spec.achievementCode || spec.code || spec.thingCode || spec.thingId || spec.id || '',
        ).trim() || slugify(name);
      if (!rawCode) {
        warnings.push('Addthing{ thingType = achievement }: "achievementCode" belirtilmedi.');
        return;
      }
      const cleanSlug = slugify(rawCode) || `ach_${achievements.length + 1}`;
      const achId = `mod_ach_${cleanSlug}`;
      const validTiers: AchievementTier[] = ['bronze', 'silver', 'gold', 'diamond'];
      const rawTier = String(spec.tier || 'gold').toLowerCase() as AchievementTier;
      const tier: AchievementTier = validTiers.includes(rawTier) ? rawTier : 'gold';
      const validCats: AchievementCategory[] = [
        'mining',
        'crafting',
        'building',
        'exploration',
        'survival',
        'mods',
      ];
      const rawCat = String(spec.category || 'mods').toLowerCase() as AchievementCategory;
      const category: AchievementCategory = validCats.includes(rawCat) ? rawCat : 'mods';
      const title = String(spec.thingName || spec.title || spec.name || rawCode)
        .trim()
        .slice(0, 64);
      const description = String(
        spec.description ||
          spec.desc ||
          spec.thingDescription ||
          'Hayatta kalma modunda özel mod başarımını tamamla.',
      )
        .trim()
        .slice(0, 200);
      const target = Math.max(1, Math.min(1000, Math.floor(Number(spec.target ?? spec.goal ?? 1) || 1)));
      const points = Math.max(5, Math.min(200, Math.floor(Number(spec.points ?? 25) || 25)));

      achievements.push({
        id: achId,
        code: rawCode,
        modId: options.modId,
        title,
        description,
        category,
        tier,
        statKey: achId,
        target,
        points,
      });

      if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(rawCode) && env.get(rawCode) === undefined) {
        env.defineLocal(rawCode, rawCode);
      }
      return;
    }

    // 2. COMMAND
    if (rawType === 'command') {
      registerCommand(spec);
      return;
    }

    // 2. RECIPE / FURNACE
    if (rawType === 'recipe' || rawType === 'furnace') {
      const isFurnace = rawType === 'furnace' || Boolean(spec.requiresFurnace);
      const outId = String(spec.outputId || spec.output || 'diamond');
      const outCount = Math.max(1, Number(spec.outputCount ?? spec.count ?? 1));
      const pat = parseRecipePattern(spec);
      recipes.push({
        id: `lua_rec_${slugify(name)}_${recipes.length + 1}`,
        name,
        ...(pat ? { pattern: pat } : {}),
        ingredientA: spec.input ? String(spec.input) : spec.ingredientA ? String(spec.ingredientA) : undefined,
        countA: Number(spec.inputCount ?? spec.countA ?? 1),
        outputId: outId,
        outputCount: outCount,
        requiresFurnace: isFurnace,
      });
      return;
    }

    // Resolve single or multi-face textures
    let customTexture = resolveTextureVal(spec.thingTexture || spec.texture);
    const texTable = (spec.thingTextures || spec.textures) as Record<string, unknown> | undefined;
    const faceTextures: Partial<Record<CubeFaceKey, string>> = {};
    if (texTable && typeof texTable === 'object') {
      const faceAlias: Record<string, CubeFaceKey> = {
        left: 'left',
        right: 'right',
        front: 'front',
        back: 'back',
        up: 'top',
        top: 'top',
        down: 'bottom',
        bottom: 'bottom',
      };
      const allTex = resolveTextureVal(texTable.all);
      const sideTex = resolveTextureVal(texTable.side);
      if (allTex) {
        (['left', 'right', 'front', 'back', 'top', 'bottom'] as CubeFaceKey[]).forEach(
          (fk) => (faceTextures[fk] = allTex),
        );
      }
      if (sideTex) {
        (['left', 'right', 'front', 'back'] as CubeFaceKey[]).forEach(
          (fk) => (faceTextures[fk] = sideTex),
        );
      }
      Object.entries(texTable).forEach(([k, v]) => {
        const fk = faceAlias[k.toLowerCase()];
        const tv = resolveTextureVal(v);
        if (fk && tv) {
          faceTextures[fk] = tv;
        }
      });
      if (!customTexture) {
        customTexture =
          faceTextures.front ||
          faceTextures.top ||
          faceTextures.left ||
          Object.values(faceTextures)[0];
      }
    }

    // 3. FLOWING LIQUID + AUTOMATIC BUCKET (`thingType = liquid | fluid | sivi`)
    if (rawType === 'liquid' || rawType === 'fluid' || rawType === 'sivi') {
      const flowSpeedRaw = String(spec.flowSpeed || spec.speed || 'fast').toLowerCase();
      const defaultDelay =
        flowSpeedRaw === 'slow' || style === 'lava'
          ? 500
          : flowSpeedRaw === 'medium'
            ? 280
            : 170;
      const flowDelayMs = Math.max(
        80,
        Math.min(1500, Number(spec.flowDelay ?? spec.flowDelayMs ?? defaultDelay)),
      );
      const spread = Math.max(
        1,
        Math.min(7, Math.floor(Number(spec.flowRange ?? spec.spread ?? (style === 'lava' ? 3 : 5)))),
      );
      const isHarmful = Boolean(spec.harmful ?? spec.isHarmful ?? (Number(spec.damage ?? 0) > 0 || style === 'lava'));
      const isTransparent =
        spec.transparent !== undefined ? Boolean(spec.transparent) : style !== 'lava' && !isHarmful;
      const isGlow =
        spec.glow !== undefined
          ? Boolean(spec.glow)
          : style === 'lava' || Number(spec.lightLevel ?? 0) > 0;
      const liqPattern: BlockPattern =
        style === 'lava' ? 'lava' : style === 'glowBlock' || style === 'glow' ? 'glow' : style === 'normalBlock' || style === 'solid' ? 'solid' : 'water';

      const bucketId = String(spec.bucketId || `${id}_bucket`);
      const bucketName = String(spec.bucketName || `${name} Kovası`).trim().slice(0, 32);

      blocks.push({
        id,
        name: name.slice(0, 32),
        color,
        secondaryColor,
        pattern: liqPattern,
        ...(customTexture ? { customTexture } : {}),
        ...(Object.keys(faceTextures).length > 0 ? { faceTextures } : {}),
        hardness: -1,
        blastResistance: 100,
        minToolTier: 0,
        preferredTool: 'none',
        transparent: isTransparent,
        nonSolid: false,
        isLiquid: true,
        liquidSpread: spread,
        liquidFlowDelayMs: flowDelayMs,
        liquidHarmful: isHarmful,
        bucketItemId: bucketId,
        glow: isGlow,
        lightLevel: isGlow ? Number(spec.lightLevel ?? 14) : 0,
        spawnAsOre: false,
        spawnOnSurface: false,
        craftIngredientId: '',
        craftIngredientCount: 0,
        craftOutputCount: 1,
      });

      const pat = parseRecipePattern(spec.recipe);
      items.push({
        id: bucketId,
        name: bucketName,
        itemKind: 'bucket',
        color,
        secondaryColor,
        liquidSecondaryColor: secondaryColor,
        placesLiquidId: id,
        ...(customTexture ? { customTexture } : {}),
        ...(customModel ? { customModel } : {}),
        ...(anim ? { animation: anim } : {}),
        stackSize: 1,
        ...(pat
          ? {
              craftPattern: pat,
              craftOutputCount: Math.max(1, Number((spec.recipe as Record<string, unknown>)?.count ?? 1)),
            }
          : {}),
      });

      if ((hooks.onUse || hooks.onPlace || hooks.onTick) && !itemHooks.has(bucketId)) {
        itemHooks.set(bucketId, hooks);
      }
      return;
    }

    // 4. BLOCK
    if (rawType === 'block') {
      const isGlow = style === 'glowBlock' || Boolean(spec.glow) || Number(spec.lightLevel ?? 0) > 0;
      const isGlass = style === 'glassBlock' || Boolean(spec.transparent);
      const blk: ModBlockSpec = {
        id,
        name,
        color,
        secondaryColor,
        pattern: normalizePattern(style),
        ...(customTexture ? { customTexture } : {}),
        ...(Object.keys(faceTextures).length > 0 ? { faceTextures } : {}),
        ...(customModel ? { customModel } : {}),
        ...(anim ? { animation: anim } : {}),
        hardness: Number(spec.hardness ?? 1.4),
        blastResistance: Number(spec.blastResistance ?? 12),
        minToolTier: Number(spec.minToolTier ?? 0),
        preferredTool: (spec.preferredTool as ToolType) || 'pickaxe',
        transparent: isGlass || style === 'crossBlock' || Boolean(customModel),
        nonSolid: Boolean(spec.nonSolid) || style === 'crossBlock',
        glow: isGlow,
        lightLevel: isGlow ? Number(spec.lightLevel ?? 14) : 0,
        spawnAsOre: Boolean(spec.spawnAsOre || spec.oreSpawn || style === 'oreBlock'),
        spawnOnSurface: Boolean(spec.spawnOnSurface || spec.surfaceSpawn),
        spawnBiomes: spec.biomes ? (toTableArray(spec.biomes) as BiomeType[]) : undefined,
        minSpawnY: Number(spec.minY ?? 4),
        maxSpawnY: Number(spec.maxY ?? 48),
        craftIngredientId: '',
        craftIngredientCount: 0,
        craftOutputCount: Number((spec.recipe as Record<string, unknown>)?.count ?? 2),
      };
      const pat = parseRecipePattern(spec.recipe);
      if (pat) {
        blk.craftPattern = pat;
      }
      blocks.push(blk);
      return;
    }

    // 4. WEAPONS & TOOLS (gun, sword, bow, staff, weapon, pickaxe, axe, shovel, tool)
    if (
      ['tool', 'weapon', 'gun', 'sword', 'bow', 'staff', 'pickaxe', 'axe', 'shovel'].includes(
        rawType,
      )
    ) {
      const isRangedWeapon = ['gun', 'bow', 'staff', 'weapon'].includes(rawType);
      if (isRangedWeapon) {
        const defaultKind: WeaponKind =
          rawType === 'gun' ? 'gun' : rawType === 'bow' ? 'bow' : rawType === 'staff' ? 'staff' : 'gun';
        const weapon =
          parseWeapon(spec.weapon || spec, defaultKind) || {
            weaponKind: defaultKind,
            damage: 10,
            cooldown: 0.25,
            range: 44,
            projectileSpeed: 38,
            projectileColor: color,
          };
        const pat = parseRecipePattern(spec.recipe);
        items.push({
          id,
          name,
          itemKind: 'weapon',
          color,
          secondaryColor,
          ...(customTexture ? { customTexture } : {}),
          ...(customModel ? { customModel } : {}),
          ...(anim ? { animation: anim } : {}),
          weapon,
          stackSize: 1,
          ...(pat ? { craftPattern: pat, craftOutputCount: 1 } : {}),
        });
      } else {
        const tt: ToolType =
          rawType === 'sword' || style === 'sword'
            ? 'sword'
            : rawType === 'axe' || style === 'axe'
              ? 'axe'
              : rawType === 'shovel' || style === 'shovel'
                ? 'shovel'
                : ((spec.toolType as ToolType) || 'pickaxe');
        const weapon = parseWeapon(spec.weapon || (tt === 'sword' ? spec : undefined), 'melee');
        const pat = parseRecipePattern(spec.recipe);
        tools.push({
          id,
          name,
          color,
          toolType: tt,
          miningSpeed: Number(spec.miningSpeed ?? 12),
          toolTier: Number(spec.toolTier ?? 4),
          durability: Number(spec.durability ?? 1000),
          ...(customTexture ? { customTexture } : {}),
          ...(customModel ? { customModel } : {}),
          ...(anim ? { animation: anim } : {}),
          ...(weapon ? { weapon } : {}),
          craftIngredientId: '',
          craftIngredientCount: 0,
          ...(pat ? { craftPattern: pat } : {}),
        });
      }
      return;
    }

    // 5. ITEM / FOOD / MATERIAL / GEM
    const itemKind =
      rawType === 'food' || Number(spec.foodValue ?? 0) > 0
        ? 'food'
        : rawType === 'gem'
          ? 'gem'
          : 'material';
    const pat = parseRecipePattern(spec.recipe);
    items.push({
      id,
      name,
      itemKind,
      color,
      secondaryColor,
      ...(customTexture ? { customTexture } : {}),
      ...(customModel ? { customModel } : {}),
      ...(anim ? { animation: anim } : {}),
      foodValue: itemKind === 'food' ? Number(spec.foodValue ?? 6) : undefined,
      stackSize: Math.max(1, Math.min(64, Number(spec.stackSize ?? 64))),
      ...(pat ? { craftPattern: pat, craftOutputCount: Number((spec.recipe as Record<string, unknown>)?.count ?? 1) } : {}),
    });
  };

  env.defineLocal('Addthing', registerThing);
  env.defineLocal('AddThing', registerThing);

  try {
    const tokens = tokenize(source);
    const parser = new Parser(tokens);
    const program = parser.parseProgram();
    const vm = new CottonLuaVM(env, 80000);
    vm.execBlock(program, env);

    // Read wantedMods declared in script (`local wantedMods = "api_..."` or `{"api_1", "api_2"}`)
    const wanted = env.get('wantedMods');
    if (typeof wanted === 'string') {
      resolveDepById(wanted);
    } else if (Array.isArray(wanted)) {
      wanted.forEach((w) => {
        if (typeof w === 'string') resolveDepById(w);
        else if (w && typeof w === 'object' && (w as Record<string, unknown>).__modId) {
          dependencies.add(String((w as Record<string, unknown>).__modId));
        }
      });
    } else if (wanted && typeof wanted === 'object') {
      const rec = wanted as Record<string, unknown>;
      if (rec.__modId) {
        dependencies.add(String(rec.__modId));
      } else {
        toTableArray(wanted).forEach((w) => {
          if (typeof w === 'string') resolveDepById(w);
        });
      }
    }

    const modName = String(env.get('ModName') || options.modName || 'CottonLua Modu').slice(0, 64);
    const modVersion = String(env.get('ModVersion') || options.modVersion || '1.0.0').slice(0, 16);
    const modDescription = String(
      env.get('ModDescription') || options.modDescription || 'CottonLua ile kodlanmış mod paketi.',
    ).slice(0, 300);

    const invokeHook = (
      fn: LuaFnValue,
      bridge: CottonLuaWorldBridge,
      ctx: CottonLuaHookContext,
    ): { ok: boolean; error?: string } => {
      activeBridgeRef.current = bridge;
      vm.steps = 0;
      try {
        const luaCtx = {
          ...ctx,
          world: worldProxy,
          explode: bridge.explode,
          setBlock: bridge.setBlock,
          getBlock: bridge.getBlock,
          teleport: bridge.teleportPlayer,
          launch: bridge.launchPlayer,
          heal: bridge.healPlayer,
          give: bridge.giveItem,
          say: bridge.say,
          spawnMob: bridge.spawnMob,
          spawnParticles: bridge.spawnParticles,
          spawnLightning: bridge.spawnLightning,
          achievementTake: triggerAchievementTake,
        };
        fn(luaCtx, ctx.args || []);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      } finally {
        activeBridgeRef.current = null;
      }
    };

    return {
      ok: true,
      modName,
      modVersion,
      modDescription,
      dependencies: Array.from(dependencies),
      blocks,
      items,
      tools,
      recipes,
      commands,
      achievements,
      itemHooks,
      commandHandlers,
      worldTickHooks,
      logs,
      warnings,
      errors,
      invokeHook,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    return {
      ok: false,
      modName: options.modName || 'Hatalı CottonLua Modu',
      modVersion: options.modVersion || '1.0.0',
      modDescription: options.modDescription || '',
      dependencies: Array.from(dependencies),
      blocks: [],
      items: [],
      tools: [],
      recipes: [],
      commands: [],
      achievements: [],
      itemHooks: new Map(),
      commandHandlers: new Map(),
      worldTickHooks: [],
      logs,
      warnings,
      errors,
      invokeHook: () => ({ ok: false, error: msg }),
    };
  }
}
