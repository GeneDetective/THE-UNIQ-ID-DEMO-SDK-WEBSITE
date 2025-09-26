# THE-UNIQ-ID — Demo SDK Website (Gourmet Pizza)

> Demo website that shows side-by-side integration of:
>
> 1. **UNIQ ID** (privacy-first ZK-based login) and
> 2. **Google OAuth 2.0** (typical OAuth login).
>
> This repository is a small “Gourmet Pizza” storefront that demonstrates how a site can accept both login options and saves them into two separate local DB files so you can compare the privacy / data stored differences.

---

## Table of contents

* [What this repo is for](#what-this-repo-is-for)
* [Prerequisites](#prerequisites)
* [Quick overview of what to clone first](#quick-overview-of-what-to-clone-first)
* [Folder & important files](#folder--important-files)
* [Create Google OAuth credentials (step-by-step)](#create-google-oauth-credentials-step-by-step)
* [Prepare `.env` (example)](#prepare-env-example)
* [Install & run locally](#install--run-locally)
* [How to test — UNIQ vs Google flows](#how-to-test---uniq-vs-google-flows)
* [Where user data lives (local files)](#where-user-data-lives-local-files)
* [How to integrate this SDK into another website — quick summary](#how-to-integrate-this-sdk-into-another-website---quick-summary)
* [Troubleshooting](#troubleshooting)

---

## What this repo is for

This repo is a demonstration of integrating your UNIQ ID SDK into a normal website, running next to Google OAuth so you can:

* Try UNIQ sign up / login (ZK-based — does not expose email/DeKey to the website).
* Try Google OAuth sign up / login (classic flow — website will get profile email).
* Compare what each method stores locally (privacy & liability differences).
* See example server code that calls the UNIQ SDK artifacts (wasm/zkey/witness) in `uniqid-sdk/`.

> NOTE: The UNIQ ID registration (anchoring roots to Sepolia) is handled by the separate repository:
> `https://github.com/GeneDetective/THE-UNIQ-ID.git`
> You should run/compile/deploy that (or use its dev server) to register a root before you test the UNIQ login on this demo.

---

## Prerequisites

* Node >=16 and npm installed.
* Git.
* A Google account (for OAuth credentials).
* Sepolia RPC URL & deployed UNIQ contract address (if you want to test on-chain checks) — see below.

---

## Quick overview of what to clone first

1. Clone the registration/anchor repo (used to create UNIQ roots on chain):

   ```bash
   git clone https://github.com/GeneDetective/THE-UNIQ-ID.git
   # follow its README: compile/deploy the contract, run its server and register a user
   ```
2. Clone this demo repo (if you haven't already):

   ```bash
   git clone https://github.com/GeneDetective/THE-UNIQ-ID-DEMO-SDK-WEBSITE.git
   cd THE-UNIQ-ID-DEMO-SDK-WEBSITE
   ```

---

## Folder & important files (what to look at)

```
.
├─ uniqid-sdk/
│  ├─ circuits/                     # poseidon & zkey & wasm + witness helper
│  │  ├─ pos_prove.wasm
│  │  ├─ pos_prove_final.zkey
│  │  └─ ...
│  └─ uniqid-sdk.server.js          # demo helper that uses/unpacks the SDK artifacts
├─ public/                          # demo static pages (landing, CSS)
├─ views/                           # ejs templates for login, signup and dashboards
├─ server.js                        # demo app entrypoint (runs on PORT from .env)
├─ .env.example                     # example env variables (copy -> .env)
├─ uniqid_users.json                # local DB file storing UNIQ logins (demo)
├─ userdb.json                      # local DB storing Google OAuth users (demo)
└─ package.json
```

---

## Create Google OAuth credentials (step-by-step)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. In “APIs & Services” → “OAuth consent screen”:

   * Choose **External** (for demo) and fill required fields (app name, email). Save.
4. Go to “Credentials” → **Create Credentials** → **OAuth client ID**.

   * Application type: **Web application**
   * Name: `THE-UNIQ-ID-Demo` (or your choice)
   * Authorized redirect URIs: add:

     ```
     http://localhost:3000/auth/google/callback
     ```
   * Save and copy `Client ID` and `Client secret`.

**Why the callback above?**
This repo’s server listens on `PORT=3000` by default and expects Google callback at `/auth/google/callback`. If you change `PORT`, update the redirect URI accordingly in Google Console.

---

## Prepare `.env` (example)

Create a `.env` in the repo root (do **not** commit `.env`). You can copy from `.env.example`:

```text
# Google OAuth
GOOGLE_CLIENT_ID=YOUR_GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_CLIENT_SECRET
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback

# Server & session
SESSION_SECRET=some_long_secret_here
PORT=3000

# UNIQ SDK circuit artifact paths (relative)
POS_WASM_PATH=./uniqid-sdk/circuits/pos_prove_js/pos_prove.wasm
POS_ZKEY_PATH=./uniqid-sdk/circuits/pos_prove_final.zkey

# Ethereum (Sepolia) — used by uniqid-sdk server code to check on-chain
# NOTE: the demo uniqid-sdk server looks for these keys at runtime. Use the
# same RPC and contract address that you used to register roots in the
# THE-UNIQ-ID repository.
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY
CONTRACT_ADDR=0xYOUR_CONTRACT_ADDR
```

> Important: this repo expects `SEPOLIA_RPC_URL` and `CONTRACT_ADDR` to be present in uniqid-sdk\uniqid-sdk.server.js line 23, 24:
> ```bash
> const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "https://sepolia.infura.io/v3/YOUR_INFURA_KEY";
> 
> const CONTRACT_ADDR = process.env.CONTRACT_ADDR || "0xYOUR_CONTRACT_ADDR";
> ```
> replace the placeholder values with your actual Sepolia RPC URL and Contract Address.

---

## Install & run locally

From the repo root:

```bash
# install dependencies
npm install

# run the demo server
node server.js

```

Open browser: `http://localhost:3000` — you should see the Gourmet Pizza landing page with sign-in options.

---

## How to test — UNIQ vs Google flows

### 1) Prepare an anchored UNIQ root (required for UNIQ to validate on-chain)

Use the registration repo and follow its README:

* Register an email & DeKey there (that repo will hash them and anchor the root on Sepolia).
* After registration, note the root/contract actions. Ensure `CONTRACT_ADDR` in your `.env` in this demo points to the same deployed contract address.

### 2) Test Google OAuth

* Click **Sign in with Google** on demo site.
* Complete Google auth; the demo will receive profile/email and create a local `userdb.json` entry.

`userdb.json` will contain the Google user info (email, name, profile id) — this is what a website normally receives from a third party login provider.

### 3) Test UNIQ login (privacy-first)

* On the demo site choose **Sign in with UNIQ** (or the UNIQ sign form).
* Enter the **same** email + DeKey you used with the registration repo.
* The SDK will:

  * Hash the email and DeKey (Poseidon) → compute leaf/root,
  * Query the contract at `CONTRACT_ADDR` via `SEPOLIA_RPC_URL` to check the root exists,
  * Generate a zk-proof (using wasm + zkey) proving you know email+DeKey that produce that registered root — *without revealing the raw values* to the demo server.
* If proof verifies & root present → demo server stores only a UNIQ account ID entry into `uniqid_users.json` (no email, no DeKey).

**Compare**:

* `userdb.json` (Google) contains actual email & profile; `uniqid_users.json` (UNIQ) contains only UNIQ identifier and metadata — website never got email/deKey.

---

## Where user data lives (local files)

* `userdb.json` — Google OAuth users (demo storage). Contains profile/email.
* `uniqid_users.json` — UNIQ ID users (demo storage). Contains assigned UNIQ-ID and minimal metadata (no email/DeKey).

You can open these JSON files to inspect what each flow saved.

---

## How to integrate this SDK into another website — quick summary

1. Copy `uniqid-sdk/` folder into your app (it contains wasm + zkey + witness helpers).
2. Add `uniqid-sdk.server.js` (or adapt) — it demonstrates:

   * how to compute Poseidon hashes,
   * how to build witness using `witness_calculator.js`,
   * how to call `snarkjs` to generate proof (if using Groth16),
   * how to verify root via ethers + contract address.
3. Update `.env` with `SEPOLIA_RPC_URL` and `CONTRACT_ADDR`.
4. From your frontend, call the SDK function to generate the proof and only send the proof + UNIQ-ID to your backend. Backend verifies proof and creates session for UNIQ-ID.

> This repo’s `server.js` and views are a working example that demonstrates the above with minimal code.

---

## Troubleshooting

* **Google callback not working** — confirm redirect URI in Google Console exactly matches `GOOGLE_CALLBACK_URL` in `.env`.
* **UNIQ flow fails to find root on chain** — confirm:

  * `SEPOLIA_RPC_URL` is correct and points to Sepolia endpoint (Infura/Alchemy).
  * `CONTRACT_ADDR` matches the contract you deployed when anchoring roots.
  * The user registration repo actually anchored a root for the email+DeKey used.
* **WASM / zkey errors** — ensure `POS_WASM_PATH` and `POS_ZKEY_PATH` point to valid files inside `uniqid-sdk/circuits/`.

---

