# Changesets Guide for Ripple

This guide explains how to use Changesets to manage versioning and publishing for the Ripple monorepo.

## What is Changesets?

Changesets is a tool that helps you:
- Manage version bumps across multiple packages
- Generate changelogs automatically
- Publish packages to npm in a coordinated way
- Handle internal dependencies between packages

## Setup Complete ✅

Changesets is already configured for this project with:
- **Independent versioning** - Each package can version independently
- **Automatic internal dependency updates** - When `@ripple/core` bumps, dependent packages get patch bumps
- **Public access** - Scoped packages (`@ripple/*`) are published as public

## Workflow

### 1. Making Changes

When you make changes to any package:

```bash
# Make your code changes
# ... edit files ...

# Add a changeset describing your change
npx changeset
```

The changeset command will:
1. Ask which packages changed
2. Ask what type of change (patch/minor/major)
3. Ask for a description

This creates a markdown file in `.changeset/` describing your change.

### 2. Committing Changes

```bash
git add .
git commit -m "feat: add new feature"
git push
```

**Important:** Always commit changesets along with your code changes!

### 3. Versioning Packages

When you're ready to release:

```bash
npm run version
```

This will:
- ✅ Update `package.json` versions based on changesets
- ✅ Generate/update `CHANGELOG.md` files
- ✅ Remove used changesets
- ✅ Update internal dependencies (e.g., `@ripple/react` depends on `@ripple/core`)

### 4. Building and Publishing

After versioning:

```bash
npm run release
```

This will:
- ✅ Build all packages
- ✅ Publish to npm (requires npm login)

Or manually:

```bash
# Build first
npm run build

# Then publish
npx changeset publish
```

## Version Bump Types

- **Patch** (`0.1.0` → `0.1.1`) - Bug fixes, no breaking changes
- **Minor** (`0.1.0` → `0.2.0`) - New features, backward compatible
- **Major** (`0.1.0` → `1.0.0`) - Breaking changes

## Example Workflow

### Scenario: Adding a new feature to `@ripple/core`

```bash
# 1. Make changes
# Edit packages/ripple/src/...

# 2. Add changeset
npx changeset
# Select: @ripple/core
# Select: minor (new feature)
# Description: "Add new subscription API"

# 3. Commit
git add .
git commit -m "feat(core): add new subscription API"
git push

# 4. Later, when ready to release
npm run version
# This bumps @ripple/core to 0.2.0
# And automatically bumps @ripple/react and @ripple/angular to 0.1.1 (patch)

# 5. Review changes, then publish
npm run release
```

## Internal Dependencies

When `@ripple/core` changes:
- **Patch bump** → `@ripple/react` and `@ripple/angular` get patch bumps
- **Minor bump** → Dependent packages get patch bumps
- **Major bump** → Dependent packages get patch bumps

This is configured in `.changeset/config.json` with:
```json
"updateInternalDependencies": "patch"
```

## CI/CD Integration (Future)

You can set up GitHub Actions to:
- Automatically create version PRs when changesets are merged
- Automatically publish when version PRs are merged

See: https://github.com/changesets/action

## Troubleshooting

### "No changesets present"
- Make sure you've run `npx changeset` and committed the changeset file

### "Package not found" when publishing
- Make sure you're logged into npm: `npm login`
- Verify package names are available on npm

### Internal dependencies not updating
- Check `.changeset/config.json` has `"updateInternalDependencies": "patch"`
- Make sure dependencies use version ranges (not `file:`) after first publish

## Next Steps

1. ✅ Changesets is set up and ready
2. Make your first changes and add a changeset
3. When ready, run `npm run version` then `npm run release`

For more information, see the [Changesets documentation](https://github.com/changesets/changesets).

