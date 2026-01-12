export type UnknownObject = Record<string, unknown>;

export const SET_GLOBALS_EVENT_TYPE = "openai:set_globals";

export interface SetGlobalsEvent extends Event {
    detail: {
        globals: Partial<OpenAiGlobals>;
    };
}

export interface OpenAiGlobals {
    client: UnknownObject | null;
    currentUser: UnknownObject | null;
    theme: UnknownObject | null;
    toolOutput: UnknownObject | null;
    toolResponseMetadata: UnknownObject | null;
    widgetState: UnknownObject | null;
    [key: string]: unknown;
}
