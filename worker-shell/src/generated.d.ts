declare module "../../app/generated/rust-core/rust_core.js" {
  export default function init(input?: unknown): Promise<unknown>;

  export class Engine {
    constructor();
    ingest(eventJson: string): string;
    snapshot(): string;
  }

  export function validate_event(eventJson: string): string;
}
