export interface LatchConfig {
    cloud_url: string;
    workspace?: string;
    agent_key?: string;
    upstream_id?: string;
}
export declare function getConfigPath(): string;
export declare function loadConfig(): LatchConfig | null;
export declare function saveConfig(config: LatchConfig): void;
export declare function mergeWithEnv(config: LatchConfig | null): LatchConfig;
