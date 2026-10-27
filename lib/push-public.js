/**
 * Specchio pubblico dello storico notifiche: collezione `push_public`.
 *
 * `push_history` contiene campi interni che non devono essere pubblici
 * (gbUrl = indirizzo del CMS, metadata.rootzine, sentBy/sentByName = chi ha
 * inviato, appId...). Le pagine pubbliche dell'archivio (storico-notifiche,
 * archivio-eventi) leggono quindi SOLO `push_public`, che contiene i soli
 * campi che mostrano. Stessa idea di `app_public`.
 *
 * Regole:
 *   - stesso doc ID di push_history: il reader (api/article-proxy) riceve l'id
 *     dalla pagina pubblica e rilegge gbUrl lato server da push_history/{id};
 *   - scritta SOLO dal server (Admin SDK): nelle regole `push_public` è write:false;
 *   - al posto di gbUrl c'è `hasDetail` (true se la notifica ha un contenuto
 *     da aprire con "Leggi il dettaglio"), mai l'indirizzo.
 *
 * Ogni punto che scrive push_history deve aggiornare anche lo specchio con le
 * funzioni qui sotto. Se una pagina pubblica deve mostrare un campo nuovo,
 * aggiungilo a PUBLIC_FIELDS (e lancia scripts/backfill-push-public.js).
 */

const PUBLIC_COLLECTION = 'push_public';

// Campi copiati tali e quali da push_history.
const PUBLIC_FIELDS = [
    'appSlug', 'status', 'source', 'sentAt',
    'title', 'message', 'fullMessage',
    'thumbnail', 'contentUnavailable'
];

/**
 * Dai dati (completi o parziali) di un doc push_history ricava i campi dello
 * specchio. Copia solo i campi presenti, così con set(..., {merge:true}) non
 * cancella arricchimenti già salvati (thumbnail, contentUnavailable).
 */
function toPublic(data) {
    const out = {};
    if (!data) return out;
    for (const k of PUBLIC_FIELDS) {
        if (data[k] !== undefined) out[k] = data[k];
    }
    if (data.gbUrl !== undefined) out.hasDetail = !!data.gbUrl;
    return out;
}

/** Aggiunge al batch la scrittura dello specchio di un doc push_history. */
function batchSetPublic(batch, db, docId, data) {
    const pub = toPublic(data);
    if (Object.keys(pub).length === 0) return false;
    batch.set(db.collection(PUBLIC_COLLECTION).doc(docId), pub, { merge: true });
    return true;
}

/**
 * Ricopia nello specchio un doc push_history già salvato (rilettura dal
 * server: fa fede push_history). Se il doc non esiste più, toglie anche
 * la copia pubblica.
 */
async function mirrorFromHistory(db, docId) {
    const snap = await db.collection('push_history').doc(docId).get();
    const ref = db.collection(PUBLIC_COLLECTION).doc(docId);
    if (!snap.exists) {
        await ref.delete();
        return false;
    }
    await ref.set(toPublic(snap.data()), { merge: true });
    return true;
}

/**
 * Applica allo specchio un aggiornamento parziale fatto su push_history
 * (es. thumbnail, contentUnavailable). Se la copia pubblica non esiste ancora
 * (notifica precedente al backfill) la crea completa da push_history, invece
 * di lasciare un doc a metà senza appSlug/sentAt.
 */
async function updatePublic(db, docId, patch) {
    const pub = toPublic(patch);
    if (Object.keys(pub).length === 0) return;
    try {
        await db.collection(PUBLIC_COLLECTION).doc(docId).update(pub);
    } catch (e) {
        // 5 = NOT_FOUND
        if (e && (e.code === 5 || e.code === 'not-found')) {
            await mirrorFromHistory(db, docId);
        } else {
            throw e;
        }
    }
}

module.exports = { PUBLIC_COLLECTION, PUBLIC_FIELDS, toPublic, batchSetPublic, mirrorFromHistory, updatePublic };
