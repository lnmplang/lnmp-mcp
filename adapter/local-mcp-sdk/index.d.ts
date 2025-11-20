export type Tool = {
  name: string;
  description?: string;
  inputSchema?: any;
  outputSchema?: any;
  handler: (input: any) => Promise<any> | any;
};

export class Server {
  constructor(opts: any);
  tool(tool: Tool): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}
