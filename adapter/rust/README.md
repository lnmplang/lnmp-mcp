This crate is used to build a WASM bundle as an interface between lnmp-core (Rust) and the TypeScript adapter.

Build instructions (local):
1) Ensure Rust is installed (rustup + wasm target). Install wasm-pack (`cargo install wasm-pack`).
2) Build the wasm:
   cd adapter/rust
   wasm-pack build --target nodejs --release
3) Copy the produced `pkg/*.wasm` into `adapter/src/wasm/` for the TypeScript bindings to load:
   cp pkg/*.{wasm,js} ../src/wasm/

If lnmp-core is not present locally, this crate implements small placeholder parsing and encoding for development only.
