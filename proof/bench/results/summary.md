# Taste Bench: held-out brands

Brands: Diaspora Co., Dick Taylor Craft Chocolate, Juniper Ridge, McClure's Pickles, MUD\WTR, Paddywax, Raaka Chocolate, Rishi Tea & Botanicals. Paired difference Athena − other arm, mean over brands, 95% bootstrap CI (10,000 resamples). Pass: mean > 0 and the CI excludes 0. A brand ineligible for a task is left out of that task.

| Comparison | n | Athena | Other | Difference [95% CI] | Pass |
|---|---|---|---|---|---|
| PRIMARY t1 rho: Athena − Qloo-naive (cold) | 7 | 0.476 | 0.274 | 0.202 [0.002, 0.408] | yes |
| PRIMARY t1 rho: Athena − popularity (cold) | 7 | 0.476 | 0.036 | 0.44 [0.237, 0.602] | yes |
| PRIMARY t2 auc: Athena − Qloo-naive (cold) | 6 | 0.616 | 0.464 | 0.153 [0.057, 0.257] | yes |
| PRIMARY t2 auc: Athena − popularity (cold) | 6 | 0.616 | 0.41 | 0.206 [0.009, 0.393] | yes |
| PRIMARY t3 auc: Athena − popularity (cold) | 3 | 0.518 | 0.502 | 0.016 [-0.066, 0.155] | no |
| t1 rho: Athena − LLM + Search (cold) | 7 | 0.476 | 0.594 | -0.118 [-0.252, 0.068] | no |
| t1 rho: Athena − LLM-only (cold) | 7 | 0.476 | 0.668 | -0.192 [-0.337, -0.036] | no |
| t1 ndcg5: Athena − LLM + Search (cold) | 7 | 0.596 | 0.71 | -0.113 [-0.361, 0.081] | no |
| t1 ndcg5: Athena − LLM-only (cold) | 7 | 0.596 | 0.746 | -0.149 [-0.386, 0.034] | no |
| t1 ndcg5: Athena − Qloo-naive (cold) | 7 | 0.596 | 0.593 | 0.004 [-0.179, 0.156] | no |
| t1 ndcg5: Athena − popularity (cold) | 7 | 0.596 | 0.326 | 0.27 [0.111, 0.428] | yes |
| t2 auc: Athena − LLM + Search (cold) | 6 | 0.616 | 0.71 | -0.094 [-0.175, -0.016] | no |
| t2 auc: Athena − LLM-only (cold) | 6 | 0.616 | 0.692 | -0.076 [-0.165, 0.004] | no |
| t2 p5: Athena − LLM + Search (cold) | 6 | 0.168 | 0.311 | -0.143 [-0.311, -0.022] | no |
| t2 p5: Athena − LLM-only (cold) | 6 | 0.168 | 0.267 | -0.099 [-0.244, 0.025] | no |
| t2 p5: Athena − Qloo-naive (cold) | 6 | 0.168 | 0.1 | 0.068 [-0.067, 0.171] | no |
| t2 p5: Athena − popularity (cold) | 6 | 0.168 | 0.1 | 0.068 [0, 0.137] | no |
| t3 auc: Athena − LLM + Search (cold) | 3 | 0.518 | 0.715 | -0.197 [-0.387, -0.048] | no |
| t3 auc: Athena − LLM-only (cold) | 3 | 0.518 | 0.709 | -0.191 [-0.364, -0.029] | no |
| t1 rho: Athena − LLM + Search (known) | 7 | 0.483 | 0.636 | -0.153 [-0.306, 0.006] | no |
| t1 rho: Athena − LLM-only (known) | 7 | 0.483 | 0.692 | -0.209 [-0.385, -0.038] | no |
| t1 rho: Athena − Qloo-naive (known) | 7 | 0.483 | 0.305 | 0.178 [-0.005, 0.378] | no |
| t1 rho: Athena − popularity (known) | 7 | 0.483 | 0.036 | 0.447 [0.244, 0.611] | yes |
| t1 ndcg5: Athena − LLM + Search (known) | 7 | 0.589 | 0.781 | -0.192 [-0.417, -0.015] | no |
| t1 ndcg5: Athena − LLM-only (known) | 7 | 0.589 | 0.847 | -0.258 [-0.474, -0.069] | no |
| t1 ndcg5: Athena − Qloo-naive (known) | 7 | 0.589 | 0.618 | -0.03 [-0.209, 0.124] | no |
| t1 ndcg5: Athena − popularity (known) | 7 | 0.589 | 0.326 | 0.262 [0.109, 0.409] | yes |
| t2 auc: Athena − LLM + Search (known) | 6 | 0.63 | 0.765 | -0.135 [-0.186, -0.085] | no |
| t2 auc: Athena − LLM-only (known) | 6 | 0.63 | 0.695 | -0.065 [-0.15, 0.008] | no |
| t2 auc: Athena − Qloo-naive (known) | 6 | 0.63 | 0.495 | 0.135 [0.003, 0.259] | yes |
| t2 auc: Athena − popularity (known) | 6 | 0.63 | 0.41 | 0.22 [0.03, 0.393] | yes |
| t2 p5: Athena − LLM + Search (known) | 6 | 0.201 | 0.345 | -0.143 [-0.344, 0.022] | no |
| t2 p5: Athena − LLM-only (known) | 6 | 0.201 | 0.278 | -0.076 [-0.287, 0.09] | no |
| t2 p5: Athena − Qloo-naive (known) | 6 | 0.201 | 0.133 | 0.068 [-0.067, 0.171] | no |
| t2 p5: Athena − popularity (known) | 6 | 0.201 | 0.1 | 0.101 [0.033, 0.171] | yes |
| t3 auc: Athena − LLM + Search (known) | 3 | 0.518 | 0.746 | -0.228 [-0.362, -0.139] | no |
| t3 auc: Athena − LLM-only (known) | 3 | 0.518 | 0.716 | -0.198 [-0.382, -0.021] | no |
| t3 auc: Athena − popularity (known) | 3 | 0.518 | 0.502 | 0.016 [-0.066, 0.155] | no |
