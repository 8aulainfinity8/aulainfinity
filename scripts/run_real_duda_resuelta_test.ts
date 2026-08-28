import puppeteer from 'puppeteer';

interface LogEntry {
  type: string;
  text: string;
  timestamp: string;
}

async function runTest() {
  console.log('====================================================');
  console.log('INICIANDO PRUEBA DEL BOTÓN "DUDA RESUELTA" EN PREVIEW');
  console.log('====================================================\n');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    // ----------------------------------------------------
    // TEST 1: ESTUDIANTE (JIVpN7ThwvfXlQMpfDJUJzNVn573)
    // ----------------------------------------------------
    console.log('>>> [PASO 1] PRUEBA ESTUDIANTE: Soft-close en /chats/support_JIVpN7ThwvfXlQMpfDJUJzNVn573');
    const studentPage = await browser.newPage();
    const studentLogs: LogEntry[] = [];

    studentPage.on('console', msg => {
      const entry = {
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      };
      studentLogs.push(entry);
    });

    studentPage.on('pageerror', (err: any) => {
      studentLogs.push({
        type: 'pageerror',
        text: err.toString(),
        timestamp: new Date().toISOString()
      });
    });

    // Configurar usuario estudiante en localStorage antes de cargar
    const studentUser = {
      id: 'JIVpN7ThwvfXlQMpfDJUJzNVn573',
      uid: 'JIVpN7ThwvfXlQMpfDJUJzNVn573',
      name: 'Estudiante Test',
      email: 'student_test@aulainfinity.com',
      role: 'student'
    };

    await studentPage.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
    await studentPage.evaluate((user) => {
      localStorage.setItem('mockUser', JSON.stringify(user));
      localStorage.setItem('aulainfinity_user', JSON.stringify(user));
    }, studentUser);

    // Navegar al chat del estudiante
    await studentPage.goto('http://localhost:3000/#/chat', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));

    // Evaluar estado previo y ejecutar simulación en la página
    console.log('[Estudiante] Verificando estado antes de hacer clic en Duda Resuelta...');
    const studentBeforeState = await studentPage.evaluate(async (uid) => {
      const convoId = `support_${uid}`;
      return {
        convoId,
        localStorageKeys: Object.keys(localStorage),
        hasUser: !!localStorage.getItem('mockUser'),
        closedIdsBefore: localStorage.getItem('closed_support_conversation_ids')
      };
    }, studentUser.id);
    console.log('[Estudiante] Estado antes:', JSON.stringify(studentBeforeState, null, 2));

    // Ejecutar el flujo de Duda Resuelta desde el contexto de la aplicación del cliente
    console.log('[Estudiante] Disparando acción de "Duda resuelta" en el cliente...');
    const studentExecResult = await studentPage.evaluate(async (uid) => {
      const convoId = `support_${uid}`;
      const win = window as any;
      
      // Buscar botón en DOM si está renderizado
      const buttons = Array.from(document.querySelectorAll('button'));
      const resolveBtn = buttons.find(b => b.textContent?.includes('Duda resuelta') || b.textContent?.includes('Resolver') || b.getAttribute('title')?.includes('resuelt'));
      
      let clickTriggered = false;
      if (resolveBtn) {
        resolveBtn.click();
        clickTriggered = true;
        // Si abre modal, buscar botón confirmar
        await new Promise(r => setTimeout(r, 300));
        const modalButtons = Array.from(document.querySelectorAll('button'));
        const confirmBtn = modalButtons.find(b => b.textContent?.includes('Confirmar') || b.textContent?.includes('Sí, resolver') || b.textContent?.includes('Marcar resuelta'));
        if (confirmBtn) {
          confirmBtn.click();
        }
      }

      // Invocar también directamente la capa de servicios del runtime para registrar trazas exactas
      let serviceResult = null;
      try {
        if (win.__AULAINFINITY_API__?.closeSupportConversation) {
          serviceResult = await win.__AULAINFINITY_API__.closeSupportConversation(convoId, uid, 'student');
        }
      } catch (err: any) {
        serviceResult = { error: err.message };
      }

      return {
        clickTriggered,
        convoId,
        uid,
        serviceResult
      };
    }, studentUser.id);

    console.log('[Estudiante] Resultado de ejecución:', studentExecResult);

    // Esperar 2 segundos según especificación
    console.log('[Estudiante] Esperando 2 segundos...');
    await new Promise(r => setTimeout(r, 2000));

    // Verificar estado posterior en Firestore/Local
    const studentAfterState = await studentPage.evaluate(async (uid) => {
      const convoId = `support_${uid}`;
      return {
        closedIdsAfter: localStorage.getItem('closed_support_conversation_ids'),
        chatMessagesInLocal: localStorage.getItem(`chat_messages_${convoId}`)
      };
    }, studentUser.id);
    console.log('[Estudiante] Estado después:', JSON.stringify(studentAfterState, null, 2));

    await studentPage.close();

    // ----------------------------------------------------
    // TEST 2: ADMIN (cON1WkGVN0QKnLVT5B75TKFJbfn1)
    // ----------------------------------------------------
    console.log('\n>>> [PASO 2] PRUEBA ADMIN: Hard-delete en /chats/support_JIVpN7ThwvfXlQMpfDJUJzNVn573');
    const adminPage = await browser.newPage();
    const adminLogs: LogEntry[] = [];

    adminPage.on('console', msg => {
      const entry = {
        type: msg.type(),
        text: msg.text(),
        timestamp: new Date().toISOString()
      };
      adminLogs.push(entry);
    });

    adminPage.on('pageerror', (err: any) => {
      adminLogs.push({
        type: 'pageerror',
        text: err.toString(),
        timestamp: new Date().toISOString()
      });
    });

    const adminUser = {
      id: 'cON1WkGVN0QKnLVT5B75TKFJbfn1',
      uid: 'cON1WkGVN0QKnLVT5B75TKFJbfn1',
      name: 'Admin Test',
      email: 'admin_test@aulainfinity.com',
      role: 'admin'
    };

    await adminPage.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
    await adminPage.evaluate((user) => {
      localStorage.setItem('mockUser', JSON.stringify(user));
      localStorage.setItem('aulainfinity_user', JSON.stringify(user));
    }, adminUser);

    await adminPage.goto('http://localhost:3000/#/admin/chat', { waitUntil: 'domcontentloaded' });
    await new Promise(r => setTimeout(r, 1000));

    console.log('[Admin] Disparando acción de "Duda resuelta" en el cliente Admin...');
    const adminExecResult = await adminPage.evaluate(async (targetStudentId) => {
      const convoId = `support_${targetStudentId}`;
      const win = window as any;

      // Buscar botón en DOM si está renderizado
      const buttons = Array.from(document.querySelectorAll('button'));
      const resolveBtn = buttons.find(b => b.textContent?.includes('Duda resuelta') || b.textContent?.includes('Resolver'));
      
      let clickTriggered = false;
      if (resolveBtn) {
        resolveBtn.click();
        clickTriggered = true;
        await new Promise(r => setTimeout(r, 300));
        const modalButtons = Array.from(document.querySelectorAll('button'));
        const confirmBtn = modalButtons.find(b => b.textContent?.includes('Confirmar') || b.textContent?.includes('Eliminar') || b.textContent?.includes('Sí, eliminar'));
        if (confirmBtn) {
          confirmBtn.click();
        }
      }

      return {
        clickTriggered,
        convoId,
        targetStudentId
      };
    }, studentUser.id);

    console.log('[Admin] Resultado de ejecución:', adminExecResult);

    console.log('[Admin] Esperando 2 segundos...');
    await new Promise(r => setTimeout(r, 2000));

    await adminPage.close();

    console.log('\n====================================================');
    console.log('RESUMEN DE LOGS CAPTURADOS');
    console.log('====================================================');
    console.log(`\n--- LOGS ESTUDIANTE (${studentLogs.length} logs) ---`);
    studentLogs.forEach(l => console.log(`[${l.type.toUpperCase()}] ${l.text}`));

    console.log(`\n--- LOGS ADMIN (${adminLogs.length} logs) ---`);
    adminLogs.forEach(l => console.log(`[${l.type.toUpperCase()}] ${l.text}`));

  } finally {
    await browser.close();
  }
}

runTest().catch(err => {
  console.error('Error fatal durante la prueba:', err);
  process.exit(1);
});
