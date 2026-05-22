# Tilroy Outreach Tool

## Installatie & deployen op Vercel

### Stap 1 — Maak een GitHub repository
1. Ga naar github.com → "New repository"
2. Naam: `tilroy-outreach`
3. Klik "Create repository"
4. Upload alle bestanden uit deze map naar de repository

### Stap 2 — Deploy op Vercel
1. Ga naar vercel.com en log in (gratis account)
2. Klik "Add New Project"
3. Selecteer je GitHub repository `tilroy-outreach`
4. Klik "Deploy"

### Stap 3 — API key instellen (belangrijk!)
Na de eerste deploy:
1. Ga in Vercel naar je project → "Settings" → "Environment Variables"
2. Voeg toe:
   - Name: `ANTHROPIC_API_KEY`
   - Value: jouw Anthropic API key (te vinden op console.anthropic.com)
3. Klik "Save" en herstart de deployment ("Deployments" → "Redeploy")

### Stap 4 — Klaar!
Je krijgt een URL zoals `tilroy-outreach.vercel.app` — die kun je op elke pc of telefoon openen.

## HubSpot koppeling
De HubSpot-integratie werkt via de MCP-server. Zorg dat je HubSpot MCP-token correct is ingesteld.

## Lokaal draaien (optioneel)
```bash
npm install
npm run dev
```
Ga naar http://localhost:3000
