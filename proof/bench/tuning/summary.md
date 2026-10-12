# Taste Bench: tuning brands

Brands: Brightland, Fishwife. Paired difference Athena − other arm, mean over brands, 95% bootstrap CI (10,000 resamples). Pass: mean > 0 and the CI excludes 0. A brand ineligible for a task is left out of that task.

| Comparison | n | Athena | Other | Difference [95% CI] | Pass |
|---|---|---|---|---|---|
| PRIMARY t1 rho: Athena − LLM-only (cold) | 2 | 0.678 | 0.736 | -0.059 [-0.159, 0.041] | no |
| PRIMARY t2 auc: Athena − LLM-only (cold) | 2 | 0.595 | 0.727 | -0.132 [-0.141, -0.123] | no |
| PRIMARY t3 auc: Athena − LLM-only (cold) | 2 | 0.634 | 0.795 | -0.16 [-0.186, -0.135] | no |
| t1 rho: Athena − llmSearch (cold) | 2 | 0.678 | 0.726 | -0.048 [-0.162, 0.066] | no |
| t1 rho: Athena − naive (cold) | 2 | 0.678 | 0.375 | 0.303 [0.238, 0.367] | yes |
| t1 rho: Athena − popularity (cold) | 2 | 0.678 | -0.009 | 0.687 [0.678, 0.695] | yes |
| t1 ndcg5: Athena − llm (cold) | 2 | 0.699 | 0.87 | -0.171 [-0.266, -0.077] | no |
| t1 ndcg5: Athena − llmSearch (cold) | 2 | 0.699 | 0.874 | -0.175 [-0.275, -0.075] | no |
| t1 ndcg5: Athena − naive (cold) | 2 | 0.699 | 0.605 | 0.093 [-0.021, 0.208] | no |
| t1 ndcg5: Athena − popularity (cold) | 2 | 0.699 | 0.419 | 0.28 [0.266, 0.293] | yes |
| t2 auc: Athena − llmSearch (cold) | 2 | 0.595 | 0.754 | -0.159 [-0.175, -0.143] | no |
| t2 auc: Athena − naive (cold) | 2 | 0.595 | 0.491 | 0.104 [0.075, 0.133] | yes |
| t2 auc: Athena − popularity (cold) | 2 | 0.595 | 0.553 | 0.042 [0.038, 0.045] | yes |
| t2 p5: Athena − llm (cold) | 2 | 0.4 | 0.5 | -0.1 [-0.2, 0] | no |
| t2 p5: Athena − llmSearch (cold) | 2 | 0.4 | 0.5 | -0.1 [-0.2, 0] | no |
| t2 p5: Athena − naive (cold) | 2 | 0.4 | 0.3 | 0.1 [0, 0.2] | no |
| t2 p5: Athena − popularity (cold) | 2 | 0.4 | 0.5 | -0.1 [-0.2, 0] | no |
| t3 auc: Athena − llmSearch (cold) | 2 | 0.634 | 0.792 | -0.157 [-0.19, -0.125] | no |
| t3 auc: Athena − popularity (cold) | 2 | 0.634 | 0.474 | 0.16 [0.134, 0.186] | yes |
| t1 rho: Athena − llm (known) | 2 | 0.65 | 0.744 | -0.094 [-0.171, -0.017] | no |
| t1 rho: Athena − llmSearch (known) | 2 | 0.65 | 0.683 | -0.033 [-0.153, 0.087] | no |
| t1 rho: Athena − naive (known) | 2 | 0.65 | 0.441 | 0.21 [0.181, 0.238] | yes |
| t1 rho: Athena − popularity (known) | 2 | 0.65 | -0.009 | 0.659 [0.64, 0.678] | yes |
| t1 ndcg5: Athena − llm (known) | 2 | 0.649 | 0.883 | -0.234 [-0.262, -0.206] | no |
| t1 ndcg5: Athena − llmSearch (known) | 2 | 0.649 | 0.814 | -0.164 [-0.261, -0.068] | no |
| t1 ndcg5: Athena − naive (known) | 2 | 0.649 | 0.692 | -0.043 [-0.065, -0.021] | no |
| t1 ndcg5: Athena − popularity (known) | 2 | 0.649 | 0.419 | 0.23 [0.194, 0.266] | yes |
| t2 auc: Athena − llm (known) | 2 | 0.563 | 0.768 | -0.205 [-0.213, -0.197] | no |
| t2 auc: Athena − llmSearch (known) | 2 | 0.563 | 0.839 | -0.275 [-0.292, -0.259] | no |
| t2 auc: Athena − naive (known) | 2 | 0.563 | 0.484 | 0.079 [0.025, 0.133] | yes |
| t2 auc: Athena − popularity (known) | 2 | 0.563 | 0.553 | 0.01 [-0.025, 0.045] | no |
| t2 p5: Athena − llm (known) | 2 | 0.3 | 0.5 | -0.2 [-0.4, 0] | no |
| t2 p5: Athena − llmSearch (known) | 2 | 0.3 | 0.567 | -0.267 [-0.467, -0.067] | no |
| t2 p5: Athena − naive (known) | 2 | 0.3 | 0.3 | 0 [-0.2, 0.2] | no |
| t2 p5: Athena − popularity (known) | 2 | 0.3 | 0.5 | -0.2 [-0.4, 0] | no |
| t3 auc: Athena − llm (known) | 2 | 0.634 | 0.794 | -0.159 [-0.184, -0.135] | no |
| t3 auc: Athena − llmSearch (known) | 2 | 0.634 | 0.807 | -0.173 [-0.199, -0.147] | no |
| t3 auc: Athena − popularity (known) | 2 | 0.634 | 0.474 | 0.16 [0.134, 0.186] | yes |
