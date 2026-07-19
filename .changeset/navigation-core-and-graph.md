---
"@gamekit/navigation-core": minor
"@gamekit/navigation-graph": minor
---

Add the backend-neutral Navigation request runtime and authored graph backend with deterministic route fields, dynamic edge updates, bounded scheduling, caching, tracing, and conformance fixtures.
Expose isolated trace observers for App Host diagnostics without coupling either package to DevTools.
Track backend path dependencies so obstacle updates only invalidate intersecting Core cache entries and retained routes, while revision drift and unknown backend dependencies remain conservatively safe.
