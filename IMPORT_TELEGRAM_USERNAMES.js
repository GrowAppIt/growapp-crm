// 📱 SCRIPT IMPORT TELEGRAM USERNAMES
// Esegui questo script nella Console del browser mentre sei loggato nel CRM

(async function importTelegramUsernames() {
    console.log('🚀 Inizio import username Telegram...\n');

    // Mappa Email → Username Telegram
    const telegramMap = {
        'cristina.alioto@twinet.it': '@aliotcristi',
        'dario.barbagallo@growapp.it': '@Dabarba',
        'giancarlo.campisi@twinet.it': '@gcampisi',
        'profdaniele79@gmail.com': '@Danieleprof79',
        'silvana.lamonica@twinet.it': '@slamonica',
        'salvomaniaci@gmail.com': '@salvomaniaci95',
        'siciliagranata@gmail.com': '@Siciliagranata',
        'carmelopalumbo@outlook.it': '@metauros',
        'chiara.sciarroni@gmail.com': '@chiarasciarroni'
    };

    try {
        // Ottieni tutti gli utenti
        const utentiSnapshot = await db.collection('utenti').get();

        let aggiornati = 0;
        let nonTrovati = [];

        for (const doc of utentiSnapshot.docs) {
            const utente = doc.data();
            const email = utente.email;

            if (telegramMap[email]) {
                // Aggiorna l'utente con il telegram username
                await db.collection('utenti').doc(doc.id).update({
                    telegramUsername: telegramMap[email],
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                console.log(`✅ ${utente.nome} ${utente.cognome} (${email}) → ${telegramMap[email]}`);
                aggiornati++;
            } else {
                nonTrovati.push(`${utente.nome} ${utente.cognome} (${email})`);
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log(`✅ Aggiornati: ${aggiornati} utenti`);

        if (nonTrovati.length > 0) {
            console.log(`⚠️  Non trovati (${nonTrovati.length}):`);
            nonTrovati.forEach(u => console.log(`   - ${u}`));
        }

        console.log('='.repeat(60));
        console.log('🎉 Import completato!');

        alert(`✅ Import completato!\n\n${aggiornati} utenti aggiornati con username Telegram`);

    } catch (error) {
        console.error('❌ Errore durante l\'import:', error);
        alert('❌ Errore: ' + error.message);
    }
})();
