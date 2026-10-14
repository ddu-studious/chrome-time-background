import { validateComputeInput } from './compute-provider.mjs';

// Scene resolver for `assistant.compute`: read-only pure computation over data the assistant already holds.
// No model is called here and nothing is executed outside the sandbox provider that the gateway controls.
export function validateInput(body) {
  return validateComputeInput(body);
}

export async function interpret(input, provider) {
  const outcome = await provider.compute(input);
  return { status: 'ready', source: 'compute', output: outcome.output, outputBytes: outcome.outputBytes };
}
