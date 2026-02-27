---
title: Why It Matters
description: The case for architecture models that keep pace with your code.
---

Architecture models have a reputation problem. Most end up as a diagram that was
accurate for two weeks after the offsite where someone drew it on a whiteboard, then
quietly rots until everyone learns to ignore it.

That is a waste, because a model that reflects reality is one of the most useful
things a team can have. Not for its own sake, but because of what it enables.

## Speed requires shared understanding

Knowing where to put things, what depends on what, and who to talk to when something
breaks.

That knowledge usually lives in people's heads. It transfers through pairing, review,
and hallway conversations. This works with five people. It falls apart at fifteen. By
the time you have multiple teams, you are navigating by tribal knowledge and hoping
for the best.

A model that reflects reality gives everyone the same map. New hires orient themselves
without archeological digs through the codebase. Teams see their boundaries and
dependencies at a glance. Decisions about where things belong become obvious instead
of political.

Architecture has traditionally been something owned by a small group: a handful of
senior engineers or an architecture board that maintains the diagrams and reviews
proposals. That creates a bottleneck. When only a few people can read or update the
model, everyone else works around it. Treating the model as code, in a repository,
with pull requests and review, makes it something the whole team can contribute to.
The people closest to the code are often the first to know when the architecture
shifts. Let them say so.

## The maintenance trap

Architecture models do not die because people stop valuing them. They die because
keeping them updated is a manual process disconnected from the work that changes the
architecture.

You finish a feature, push your PR, move on. Updating the diagram is a separate chore
in a separate tool. Nobody does it.

> The gap grows until trust collapses and the model becomes fiction.

This is how organizations end up with a Confluence page full of outdated draw.io
diagrams that nobody opens. They do not help with onboarding because they describe a
system that no longer exists. They do not help communicate changes because nobody
knows which diagram to update or whether the one they are looking at is still accurate.
The effort that went into creating them is wasted the moment they fall out of sync.

## AI amplifies the gap

AI coding agents let teams ship faster, and that is genuinely useful. But they also
accelerate the drift problem. An agent asked to fetch user data will call whatever
service has the data, whether that dependency is declared or not. It solves the
immediate problem correctly. The architecture model just does not factor into that
decision.

This is not a flaw in the tooling.

> Agents are doing exactly what they are good at: accomplishing the task at hand.
> The gap was always there. AI just widens it faster.

More PRs, more features, more refactors, shipped at a pace that makes manual
structural review impractical.

The answer is not to slow down. It is to check automatically what humans can no longer review by hand.

## Model the right level

There is a second reason models fail, and it has nothing to do with process. It is
scope. Most architecture frameworks offer multiple levels of detail, and teams often
try to model all of them. In practice, the lower levels (individual components,
internal class structure) change so frequently that the model becomes a bottleneck
instead of an asset. You spend more time keeping it current than you gain from having
it, and eventually it is just in the way.

The higher levels (systems, their boundaries, and how they depend on each other)
change far less often and carry most of the value. A model at that level takes little
effort to maintain, answers the questions people actually ask ("what calls what?" and
"who owns this?"), and stays accurate long enough to be worth consulting. All Erode
needs is nodes and connections. It does not care which format or framework defines
them.

Start there. You can always add detail where it earns its keep.

> A thin model that stays true beats a detailed one that nobody trusts.

## Closing the loop

Erode checks every pull request against the declared architecture and flags what does
not match. Drift gets caught where it is introduced, during code review, before it
merges.

> A violation is not necessarily a problem. Software evolves, and new dependencies
> are a natural part of that.

What matters is that the change is visible. Someone can
look at the PR and see not just the code diff but the architectural diff. Sometimes
the right response is to update the model. Sometimes it is to rethink the approach.
Either way, the decision is conscious and documented, not something that happened by
accident six months ago.

## The cost of not paying attention

Nobody wakes up one morning and decides to build a distributed monolith. It happens one PR at a time.

A frontend starts calling a backend directly instead of going
through the gateway. A shared library quietly becomes a dependency of every service.
Each change is small, reasonable in isolation, and easy to approve without noticing the
structural shift.

Six months later, you are debugging a latency spike across services that were never
supposed to talk to each other. Or onboarding someone who cannot figure out why
deploying one service breaks three others. The architecture you thought you had is not
the architecture you are running. By then, untangling it is a project in itself.

Paying a little attention on every PR is cheap. Paying a lot of attention after the
fact is not.

> Erode does not exist to enforce rules or block merges. It exists to make people
> aware of changes while they are still small and easy to act on.

The model stays worth trusting. And a model worth trusting is one people actually
use: for onboarding, for planning, for understanding the system they build together.

Not perfect diagrams. Shared understanding that keeps pace with the code.
