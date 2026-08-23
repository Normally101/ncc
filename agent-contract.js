// Contratto di esecuzione per qualunque agente, indipendente dal provider.
// Definisce la forma di input, output e voce di audit di una singola run.
// Regola delle globali: var al top-level, mai const.

var CE_agentContract = (function () {
  // Input minimo di una run: chi esegue, cosa deve fare, limiti opzionali.
  function validateRunInput(input) {
    if (!input || typeof input !== 'object') {
      return { valido: false, motivo: 'input mancante o non oggetto' };
    }
    if (typeof input.agentId !== 'string' || input.agentId.length === 0) {
      return { valido: false, motivo: 'agentId mancante' };
    }
    if (typeof input.goal !== 'string' || input.goal.length === 0) {
      return { valido: false, motivo: 'goal mancante' };
    }
    if (
      input.budget !== undefined &&
      input.budget !== null &&
      typeof input.budget !== 'object'
    ) {
      return { valido: false, motivo: 'budget non oggetto' };
    }
    return { valido: true, motivo: null };
  }

  // Output di una run: stato finale, risultato o errore, consumo misurato.
  function validateRunOutput(output) {
    if (!output || typeof output !== 'object') {
      return { valido: false, motivo: 'output mancante o non oggetto' };
    }
    if (output.status !== 'ok' && output.status !== 'error') {
      return { valido: false, motivo: "status deve essere 'ok' o 'error'" };
    }
    if (output.status === 'ok' && output.result === undefined) {
      return { valido: false, motivo: 'result mancante con status ok' };
    }
    if (output.status === 'error' && !output.error) {
      return { valido: false, motivo: 'error mancante con status error' };
    }
    if (
      !output.usage ||
      typeof output.usage !== 'object' ||
      typeof output.usage.steps !== 'number' ||
      output.usage.steps < 0 ||
      typeof output.usage.tokens !== 'number' ||
      output.usage.tokens < 0
    ) {
      return { valido: false, motivo: 'usage mancante o negativo' };
    }
    return { valido: true, motivo: null };
  }

  // Voce di audit: traccia minimale ma completa della run, per ispezione
  // successiva indipendentemente da chi ha eseguito l'agente.
  function buildAuditEntry(run) {
    var inputCheck = validateRunInput(run && run.input);
    var outputCheck = validateRunOutput(run && run.output);
    return {
      runId: run && run.runId,
      agentId: inputCheck.valido ? run.input.agentId : null,
      provider: run && run.provider ? run.provider : 'unknown',
      status: outputCheck.valido ? run.output.status : 'invalid',
      inputMotivo: inputCheck.motivo,
      outputMotivo: outputCheck.motivo,
      usage: outputCheck.valido
        ? { steps: run.output.usage.steps, tokens: run.output.usage.tokens }
        : null,
      at: run && run.at ? run.at : null,
    };
  }

  return {
    validateRunInput: validateRunInput,
    validateRunOutput: validateRunOutput,
    buildAuditEntry: buildAuditEntry,
  };
})();
window.CE_agentContract = CE_agentContract;
