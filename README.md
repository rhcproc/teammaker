# TeamMaker

Smart team formation made simple.

TeamMaker is a Next.js application for creating balanced teams, saving them as
workspaces, and coordinating team activities. It uses Firebase Authentication,
Cloud Firestore, and Cloud Storage for accounts and persistent workspace data.

## Features

- Randomized team formation with configurable group sizes
- Fixed member pairs and locked teams
- Saved workspaces with owner, leader, member, and viewer access
- Public and private workspace support
- Assignments, submissions, evaluations, and team scores
- Lecture notes, attachments, and task submissions
- Workspace chat and notifications
- Responsive layout and dark mode

## Requirements

- Node.js 18.18 or newer
- Yarn 1.x or npm 8 or newer
- Access to the configured Firebase project, or your own Firebase web project

## Getting started

```bash
git clone https://github.com/rhcproc/teammaker.git
cd teammaker
yarn install
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

If port 3000 is already occupied, use another port:

```bash
yarn dev -p 3001
```

## Firebase configuration

Firebase is initialized in `src/services/firebase/config.ts`. The current
configuration points to the existing `shufflemates-ce09a` Firebase project.
That legacy project ID is intentional: renaming this Git repository does not
rename Firebase resources, and changing the ID without creating and configuring
a replacement project will disconnect authentication, Firestore, and Storage.

To use a different Firebase project:

1. Create a Firebase web application.
2. Enable the required Authentication providers.
3. Create a Cloud Firestore database and a Cloud Storage bucket.
4. Replace the Firebase web configuration in
   `src/services/firebase/config.ts`.
5. Add your local and deployed domains to Firebase Authentication's authorized
   domains.
6. Review and deploy appropriate Firestore and Storage security rules. The
   repository's `firebase-storage-rules.txt` is a starting reference and should
   be reviewed before production use.

Firebase web configuration values identify the client application; access must
be protected with Authentication and restrictive Firestore and Storage rules.

## Commands

| Command | Purpose |
| --- | --- |
| `yarn dev` | Start the development server |
| `yarn build` | Create an optimized production build |
| `yarn start` | Serve the production build |
| `yarn test` | Display the current test-runner status |
| `./node_modules/.bin/tsc --noEmit` | Run TypeScript validation |

Stop the development server before running `yarn build`. Development and
production builds both use `.next`; running them at the same time can create
inconsistent manifests and `MODULE_NOT_FOUND` or `/_app` errors.

## Application routes

| Route | Description |
| --- | --- |
| `/` | Landing page and account overview |
| `/app` | Team formation tool |
| `/results` | Generated team results |
| `/workspaces` | Workspaces available to the signed-in user |
| `/workspace/[workspaceId]` | Direct and preferred workspace route |
| `/workspaces/[teamName]` | Legacy name-based workspace route |
| `/workspace/[workspaceId]/team/[teamId]/chat` | Team chat |
| `/notifications` | User notifications |
| `/contact` | Contact page |

New workspace navigation uses the Firestore document ID route. If an old
name-based link cannot be resolved, open **My Workspaces** and select the
workspace again to generate the direct URL.

## Project structure

```text
src/
├── app/          Next.js routes and root layout
├── components/   Shared UI and feature components
├── contexts/     Authentication and application settings
├── services/     Firebase-backed domain services
├── styles/       Application stylesheets
├── utils/        URL, access-control, and helper utilities
└── views/        Main application screens
```

## Production

```bash
yarn build
yarn start
```

The production server uses port 3000 by default. Set a different port through
your hosting platform or pass `-p <port>` to the Next.js command when needed.
