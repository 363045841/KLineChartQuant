---
name: commit-message-generator
description: Generate clear, conventional, and meaningful commit messages following best practices and conventional commit standards
---

# Commit Message Generator

## Purpose

Generate high-quality commit messages that:
- Follow conventional commit format
- Clearly describe changes
- Provide useful context
- Aid in changelog generation
- Support semantic versioning

## When to Use

Invoke this skill when:
- User needs help writing commit messages
- Reviewing staged changes for commit
- Creating standardized team commit messages
- Generating changelog entries
- Teaching commit message best practices

## Instructions

### Step 1: Analyze the Changes

Examine the git diff to understand:
1. **Scope of change**: What files/modules affected
2. **Type of change**: Feature, fix, refactor, docs, etc.
3. **Impact**: Breaking change or not
4. **Why**: The reason for the change

### Step 2: Determine Commit Type

Choose the appropriate conventional commit type:

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation only
- **style**: Formatting, missing semicolons, etc.
- **refactor**: Code change that neither fixes a bug nor adds a feature
- **perf**: Performance improvement
- **test**: Adding or updating tests
- **build**: Changes to build system or dependencies
- **ci**: CI configuration changes
- **chore**: Other changes that don't modify src or test files
- **revert**: Reverting a previous commit

### Step 3: Identify Scope (Optional)

Determine the scope (area of codebase):
- Component name: `auth`, `api`, `ui`
- Module name: `parser`, `validator`
- Feature name: `login`, `checkout`

### Step 4: Write the Subject Line

Create a subject line that:
- Starts with type and optional scope: `type(scope):`
- Uses imperative mood: "add" not "added" or "adds"
- Is no longer than 50-72 characters
- Does not end with a period
- Clearly describes WHAT changed

### Step 5: Add Body (if needed)

Include a body for complex changes:
- Explain WHY the change was made
- Describe the previous behavior
- Explain the new behavior
- Justify your approach
- Wrap at 72 characters

### Step 6: Add Footer (if needed)

Add footer for:
- **Breaking changes**: `BREAKING CHANGE: description`
- **Issue references**: `Closes #123, Fixes #456`
- **Co-authors**: `Co-authored-by: Name <email>`

## Examples

### Simple Feature Addition

```
feat(auth): add password reset functionality

Implements password reset via email token. Users can now request
a password reset link that expires after 1 hour.

- Add /reset-password endpoint
- Implement email token generation
- Add reset form UI

Closes #142
```

### Bug Fix

```
fix(api): resolve null pointer exception in user validation

The validator was not checking for null email values before
processing, causing crashes when users submitted empty forms.

Previous behavior: Crash on null email
New behavior: Return validation error message

Fixes #234
```

### Breaking Change

```
feat(api)!: change authentication to JWT tokens

BREAKING CHANGE: Session-based auth is replaced with JWT tokens.
Clients must now include 'Authorization: Bearer <token>' header
instead of cookie-based sessions.

Migration guide:
1. Update API client to use Authorization header
2. Remove session cookie handling
3. Implement token refresh logic

Closes #567
```

### Documentation Update

```
docs(readme): add installation instructions for Windows

Added step-by-step Windows installation guide including:
- Node.js version requirements
- Common PATH configuration issues
- WSL2 setup recommendations
```

### Refactoring

```
refactor(parser): extract validation logic to separate module

Improves code organization and testability by moving validation
rules into dedicated validator module. No functional changes.

- Create validator.ts module
- Move validation rules from parser.ts
- Update tests to reflect new structure
```

## Conventional Commit Format

```
<type>[(optional scope)][!]: <description>

[optional body]

[optional footer(s)]
```

### Type + Scope Examples

```
feat(auth): ...
fix(api): ...
docs(readme): ...
style(button): ...
refactor(parser): ...
perf(query): ...
test(auth): ...
build(deps): ...
ci(github): ...
chore(release): ...
```

## Subject Line Templates

### Features
- `feat: add [feature]`
- `feat(scope): implement [functionality]`
- `feat: support [capability]`
- `feat: enable [feature]`

### Fixes
- `fix: resolve [issue]`
- `fix(scope): correct [problem]`
- `fix: prevent [error]`
- `fix: handle [edge case]`

### Refactoring
- `refactor: extract [component]`
- `refactor: simplify [logic]`
- `refactor: reorganize [structure]`
- `refactor: rename [element] to [new name]`

### Documentation
- `docs: add [documentation]`
- `docs: update [section]`
- `docs: improve [content]`
- `docs: fix typo in [location]`

## Best Practices

### Subject Line
1. **Imperative mood**: "add" not "added" or "adds"
2. **No period**: at the end
3. **Length**: 50 characters ideal, 72 max
4. **Capitalize**: First letter after type
5. **Specific**: What changed, not how

### Body
1. **Wrap**: at 72 characters
2. **Explain WHY**: not what (what is in the diff)
3. **Context**: Provide background
4. **Bullet points**: OK for listing changes
5. **Blank line**: Between subject and body

### General
1. **Atomic commits**: One logical change per commit
2. **Test**: Ensure tests pass before committing
3. **Review**: Read the diff before writing message
4. **Consistent**: Follow team conventions
5. **Meaningful**: Help future developers (including you)

## Common Mistakes to Avoid

1. **Vague messages**: ❌ "fix stuff" → ✅ "fix: resolve login timeout issue"
2. **Past tense**: ❌ "added feature" → ✅ "add feature"
3. **Too long**: ❌ 100+ character subject lines
4. **Too generic**: ❌ "update code" → ✅ "refactor(auth): extract validation logic"
5. **No context**: ❌ "fix bug" → ✅ "fix(api): handle null values in user input"

## Scope Suggestions by Project Type

### Frontend
- `ui`, `component`, `layout`, `style`, `form`, `nav`, `header`, `footer`

### Backend
- `api`, `auth`, `db`, `model`, `controller`, `middleware`, `service`

### Full Stack
- `client`, `server`, `shared`, `config`, `types`, `utils`

### DevOps
- `ci`, `cd`, `docker`, `k8s`, `deploy`, `monitoring`, `logging`

## Templates for Complex Scenarios

### Multiple Related Changes

```
feat(api): add user profile management endpoints

Implements CRUD operations for user profiles including:
- GET /users/:id/profile - Fetch profile
- PUT /users/:id/profile - Update profile
- POST /users/:id/profile/avatar - Upload avatar
- DELETE /users/:id/profile/avatar - Remove avatar

All endpoints include proper authentication and authorization.

Closes #123, #124, #125
```

### Dependency Update

```
build(deps): upgrade React from 17.0.2 to 18.2.0

Major version update with breaking changes in:
- Concurrent rendering API
- Automatic batching behavior
- SSR changes

Updated all components to use new createRoot API.
All tests passing with new version.

BREAKING CHANGE: Requires Node.js >= 14.0.0
```

### Emergency Hotfix

```
fix(security): patch XSS vulnerability in comment rendering

SECURITY: User-submitted comments were not properly sanitized,
allowing script injection attacks.

Solution: Implement DOMPurify sanitization on all user content
before rendering.

Severity: High
Affected versions: 1.0.0 - 1.2.3
Fixed in: 1.2.4

CVE-XXXX-XXXXX
```

## Output Format

```
<type>(<scope>): <subject>

<body paragraph 1>

<body paragraph 2>

<footer>
```

## Related Skills

- `git-workflow-guide`: For overall git workflows
- `changelog-generator`: For creating changelogs from commits
- `pr-description-generator`: For pull request descriptions
- `semantic-versioning`: For version bumping based on commits
