/** Adapters own all game rules. The room service knows only this contract. */
export interface GameAdapter<Options, State, Action, View> {
  readonly title: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  parseOptions(value: unknown): Options;
  create(options: Options, players: number): State;
  parseAction(value: unknown): Action | null;
  validate(state: State, actor: number, action: Action): boolean;
  update(state: State, actor: number, action: Action): State;
  complete(state: State): boolean;
  project(state: State, actor: number): View;
}

export interface GameInstance {
  apply(actor: number, action: unknown): boolean;
  complete(): boolean;
  project(actor: number): unknown;
}
export interface RegisteredGame {
  readonly title: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  parseOptions(value: unknown): unknown;
  create(options: unknown, players: number): GameInstance;
}

/** Type erasure happens once, inside a typed closure; core needs no casts or game unions. */
export function defineGame<O, S, A, V>(adapter: GameAdapter<O, S, A, V>): RegisteredGame {
  return {
    title: adapter.title,
    minPlayers: adapter.minPlayers,
    maxPlayers: adapter.maxPlayers,
    parseOptions: (value) => adapter.parseOptions(value),
    create(options, players) {
      let state = adapter.create(adapter.parseOptions(options), players);
      return {
        apply(actor, value) {
          const action = adapter.parseAction(value);
          if (action === null || !adapter.validate(state, actor, action)) return false;
          const next = adapter.update(state, actor, action);
          if (next === state) return false;
          state = next;
          return true;
        },
        complete: () => adapter.complete(state),
        project: (actor) => adapter.project(state, actor),
      };
    },
  };
}
