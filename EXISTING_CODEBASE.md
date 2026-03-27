# EXISTING_CODEBASE.md

## Important

This project already has an existing codebase (script) created previously.

The goal of the AI developer is NOT to rebuild everything from scratch.

The goal is to:

* analyze the existing script
* reuse useful parts
* reorganize the architecture
* improve code structure
* integrate the existing features into the new system architecture

---

# Existing Features

The current script already contains:

* checkout system (3 steps)
* delivery companies integration
* payment connection
* basic product system
* order management

These systems must be reused if possible.

Do not rewrite them unless necessary.

---

# Required Refactoring

The AI must:

1. analyze the current code
2. extract reusable modules
3. reorganize them into the new architecture

Example:

Old code → move into:

controllers
services
models
routes

---

# Important Rule

Do not delete existing functionality.

Instead:

* refactor
* clean the code
* improve performance
* organize modules

---

# New Systems To Add

The existing script does NOT contain these systems.

They must be implemented:

* Affiliate system
* Feedback system
* Landing page builder
* Tracking system
* Admin statistics

---

# Migration Strategy

The AI must follow this order:

Step 1
Analyze existing script

Step 2
Identify reusable components

Step 3
Reorganize project structure

Step 4
Integrate existing systems into new architecture

Step 5
Implement missing systems
