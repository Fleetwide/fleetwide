import type { TokenUsage } from '@fleetwide/core';

// Claude model pricing (per million tokens) as of 2025
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-haiku-4-20250414': { input: 0.8, output: 4 },
  'claude-opus-4-20250514': { input: 15, output: 75 },
};

const DEFAULT_PRICING = { input: 3, output: 15 };

export class CostTracker {
  private inputTokens = 0;
  private outputTokens = 0;
  private model: string;

  constructor(model = 'claude-sonnet-4-20250514') {
    this.model = model;
  }

  add(usage: { input_tokens: number; output_tokens: number }): void {
    this.inputTokens += usage.input_tokens;
    this.outputTokens += usage.output_tokens;
  }

  getUsage(): TokenUsage {
    const pricing = MODEL_PRICING[this.model] ?? DEFAULT_PRICING;
    const costUsd =
      (this.inputTokens * pricing.input) / 1_000_000 +
      (this.outputTokens * pricing.output) / 1_000_000;

    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      totalTokens: this.inputTokens + this.outputTokens,
      costUsd: Math.round(costUsd * 1_000_000) / 1_000_000, // 6 decimal precision
    };
  }
}
