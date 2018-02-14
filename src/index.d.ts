declare module "child-process-promise" {
    export interface ExecOptions {
        cwd?: string;
        env?: any;
        shell?: string;
        timeout?: number;
        maxBuffer?: number;
        killSignal?: string;
        uid?: number;
        gid?: number;
    }
    export interface ExecResult {
        stdout: string;
        stderr: string;
    }
    export function exec(cmd: string, options: ExecOptions): Promise<ExecResult>;
}

declare module "tmp-promise" {
    export interface TmpDir {
        path: string;
        cleanup(): void;
    }
    export function dir(): Promise<TmpDir>;
}
