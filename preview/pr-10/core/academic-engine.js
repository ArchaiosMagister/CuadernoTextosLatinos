import { validateEdition } from './edition-validation.js';
import { regenerateMorph, regenerateQuestion, regenerateSlot, regenerateSubquestion, } from './edition-operations.js';
/** No existe sorteo o generación implícita al cambiar de menú, cantidad o vista. */
export class AcademicEngineError extends Error {
    constructor(message) { super(message); this.name = 'AcademicEngineError'; }
}
function fail(msg) { throw new AcademicEngineError(msg); }
const normalize = (value) => value.normalize('NFC').toLocaleLowerCase('es').replace(/\s+/g, ' ').trim();
const choose = (items, seed) => items[((seed % items.length) + items.length) % items.length];
function checkSeed(seed) {
    if (!Number.isSafeInteger(seed) || seed < 0)
        fail('La semilla de selección debe ser un entero no negativo');
}
function checkRevision(revision) {
    if (!Number.isSafeInteger(revision) || revision < 0)
        fail('Revisión esperada inválida');
}
function getPlacement(edition, id) {
    return edition.placements.find(x => x.id === id) ?? fail('Aparición inexistente');
}
function getQuestion(placement, id) {
    return placement.questions.find(x => x.id === id) ?? fail('Pregunta inexistente');
}
function getChoice(placement, id) {
    const q = getQuestion(placement, id);
    if (q.kind !== 'choice')
        fail('La pregunta seleccionada no contiene apartados');
    return q;
}
function getOption(q, id) {
    return q.options.find(x => x.id === id) ?? fail('Apartado inexistente');
}
function validSlotRecord(row, kind, sourceForm, selectedRules) {
    if (row.kind !== kind || (kind === 'preverb' && (sourceForm === null || row.sourceForm !== sourceForm)))
        return false;
    // No basta con pasar un ID de una ficha de otra norma en el momento de confirmar.
    if (kind === 'phonetics' && selectedRules !== undefined &&
        (!row.phoneticRules || !row.phoneticRules.every(rule => selectedRules.includes(rule))))
        return false;
    return true;
}
function existingValues(q, exclusion) {
    const ids = new Set(exclusion);
    return new Set(q.options.flatMap(o => o.slots.filter(s => !ids.has(s.id)).map(s => normalize(s.value))));
}
function makePlan(edition, target, kind, bank, values) {
    checkRevision(target.expectedRevision);
    const normalized = validateEdition(edition);
    return { editionId: normalized.id, kind, target: structuredClone(target), optionId: values.optionId ?? null,
        wordId: values.wordId ?? null, assignments: values.assignments ?? [], morphCandidateId: values.morphCandidateId ?? null,
        replaceLocked: values.replaceLocked ?? false, baseline: JSON.stringify(normalized),
        bankId: bank.manifest.id, bankRevision: bank.manifest.revision };
}
export class AcademicQuestionEngineV1 {
    bank;
    constructor(bank) {
        this.bank = bank;
    }
    previewSlot(edition, target) {
        const p = getPlacement(validateEdition(edition), target.placementId);
        const q = getChoice(p, target.questionId), option = getOption(q, target.optionId);
        const slot = option.slots.find(s => s.id === target.slotId) ?? fail('Palabra inexistente');
        const sourceForm = target.sourceForm ?? null;
        if (option.kind === 'preverb' && !sourceForm)
            fail('Es necesario elegir la forma de partida preverbial');
        const taken = existingValues(q, [slot.id]);
        taken.add(normalize(slot.value));
        const rows = this.bank.verified(option.kind, sourceForm, option.kind === 'phonetics' ? target.phoneticRules : undefined).filter(row => !taken.has(normalize(row.value)));
        return { status: slot.locked ? 'locked' : rows.length ? 'ready' : 'no-candidates',
            candidates: rows.map(r => ({ id: r.id, value: r.value, lemmaId: r.lemmaId, analysis: r.analysis })),
            pendingReview: this.bank.statusCounts(option.kind).needsReview };
    }
    prepareSlot(edition, target, candidateId = null, seed = 0, replaceLocked = false) {
        checkSeed(seed);
        const q = getChoice(getPlacement(edition, target.placementId), target.questionId);
        const option = getOption(q, target.optionId);
        const slot = option.slots.find(x => x.id === target.slotId) ?? fail('Palabra inexistente');
        if (slot.locked && !replaceLocked)
            fail('Palabra manual bloqueada; requiere autorización expresa');
        const preview = this.previewSlot(edition, target);
        const chosen = candidateId ? preview.candidates.find(x => x.id === candidateId) : choose(preview.candidates, seed);
        if (!chosen)
            fail('No hay alternativas académicas verificadas para esta palabra');
        return makePlan(edition, target, 'slot', this.bank, { optionId: target.optionId, replaceLocked,
            assignments: [{ optionId: target.optionId, items: [{ slotId: target.slotId, candidateId: chosen.id, sourceForm: target.sourceForm ?? null }] }] });
    }
    previewMorph(edition, target) {
        const p = getPlacement(validateEdition(edition), target.placementId), q = getQuestion(p, target.questionId);
        if (q.kind !== 'morphology')
            fail('No es la pregunta de morfología');
        const word = q.words.find(w => w.id === target.wordId) ?? fail('Forma morfológica inexistente');
        const mark = p.text.markup.find(x => x.id === word.markId && x.kind === 'morph-underline') ?? fail('Subrayado inexistente');
        if (mark.reviewRequired)
            fail('El subrayado exige revisión antes de analizar');
        const rows = this.bank.verified('morphology', word.surface);
        // Distintos análisis de una misma superficie son distintos candidatos; no elegirlos al azar.
        const ambiguous = new Set(rows.map(x => `${x.lemmaId}\0${x.analysis}`)).size > 1;
        return { status: word.locked ? 'locked' : rows.length === 0 ? 'no-candidates' : ambiguous ? 'ambiguous' : 'ready',
            candidates: rows.map(r => ({ id: r.id, value: r.value, lemmaId: r.lemmaId, analysis: r.analysis })),
            pendingReview: this.bank.statusCounts('morphology').needsReview };
    }
    prepareMorph(edition, target, candidateId = null, replaceLocked = false) {
        const q = getQuestion(getPlacement(edition, target.placementId), target.questionId);
        if (q.kind !== 'morphology')
            fail('La pregunta no es morfológica');
        const current = q.words.find(x => x.id === target.wordId) ?? fail('Forma inexistente');
        if (current.locked && !replaceLocked)
            fail('Análisis manual protegido');
        const preview = this.previewMorph(edition, target);
        if (preview.status === 'ambiguous' && !candidateId)
            fail('La forma es ambigua: exige elección filológica explícita');
        const candidate = candidateId ? preview.candidates.find(x => x.id === candidateId) : preview.candidates[0];
        if (!candidate)
            fail('No hay un análisis verificado para esta forma');
        return makePlan(edition, target, 'morph', this.bank, { wordId: target.wordId, morphCandidateId: candidate.id, replaceLocked });
    }
    assignOption(q, option, count, sourceForms, newIds, allowManualReplacement, seed, excluded, selectedPhoneticRules) {
        if (!Number.isSafeInteger(count) || count < 0 || count > 30)
            fail('Cantidad solicitada inválida (0–30)');
        const slots = option.slots;
        if (!allowManualReplacement && slots.some((s, i) => s.locked && i >= count)) {
            fail('El nuevo tamaño eliminaría una palabra manual protegida');
        }
        if (option.kind === 'preverb' && (!sourceForms || sourceForms.length !== count || sourceForms.some(v => !v.trim()))) {
            fail('Indica para cada derivado preverbial su forma de partida exacta');
        }
        const neededNew = Math.max(0, count - slots.length);
        if (neededNew && (!newIds || newIds.length !== neededNew))
            fail('Faltan IDs explícitos para las nuevas casillas');
        const allocated = new Set(), items = [];
        const excludedOthers = existingValues(q, slots.map(s => s.id));
        for (const v of excluded)
            excludedOthers.add(v);
        slots.filter(s => s.locked && !allowManualReplacement).forEach(s => excludedOthers.add(normalize(s.value)));
        for (let i = 0; i < count; i++) {
            const existing = slots[i];
            const id = existing?.id ?? newIds?.[i - slots.length];
            if (!id || allocated.has(id))
                fail('ID de nueva casilla inexistente o duplicado');
            allocated.add(id);
            const sourceForm = option.kind === 'preverb' ? (sourceForms?.[i] ?? null) : null;
            if (existing?.locked && !allowManualReplacement) {
                items.push({ slotId: id, candidateId: null, sourceForm });
                continue;
            }
            const current = existing ? normalize(existing.value) : null;
            const candidates = this.bank.verified(option.kind, sourceForm, option.kind === 'phonetics' ? selectedPhoneticRules : undefined).filter(row => {
                const key = normalize(row.value);
                return key !== current && !excludedOthers.has(key);
            });
            if (!candidates.length)
                fail(`No hay suficientes términos verificados para ${option.kind} (${i + 1}/${count})`);
            const chosen = choose(candidates, seed + i);
            excludedOthers.add(normalize(chosen.value));
            items.push({ slotId: id, candidateId: chosen.id, sourceForm });
        }
        return items;
    }
    prepareSubquestion(edition, target) {
        checkSeed(target.seed);
        const q = getChoice(getPlacement(edition, target.placementId), target.questionId);
        const o = getOption(q, target.optionId);
        const items = this.assignOption(q, o, target.desiredCount, target.sourceForms, target.newSlotIds, target.allowManualReplacement ?? false, target.seed, new Set(), target.phoneticRules);
        return makePlan(edition, target, 'subquestion', this.bank, { optionId: o.id, replaceLocked: target.allowManualReplacement ?? false,
            assignments: [{ optionId: o.id, items }] });
    }
    /** Solo la pregunta 4 de elección es autogenerable; no se inventan traducciones ni sintaxis. */
    prepareChoiceQuestion(edition, target) {
        checkSeed(target.seed);
        const q = getChoice(getPlacement(edition, target.placementId), target.questionId);
        const assignments = [];
        const excluded = new Set();
        for (const [idx, o] of q.options.entries()) {
            if (!o.enabled)
                continue;
            const count = target.desiredCountByKind[o.kind] ?? o.slots.length;
            const items = this.assignOption(q, o, count, target.sourceFormsByKind?.[o.kind], target.newSlotIdsByKind?.[o.kind], target.allowManualReplacement ?? false, target.seed + idx * 31, excluded, target.phoneticRules);
            assignments.push({ optionId: o.id, items });
            for (const entry of items) {
                const candidate = entry.candidateId ? this.bank.findVerified(entry.candidateId) : null;
                const current = o.slots.find(s => s.id === entry.slotId);
                const value = candidate?.value ?? current?.value;
                if (value)
                    excluded.add(normalize(value));
            }
        }
        if (!assignments.length)
            fail('La pregunta no contiene apartados activos');
        return makePlan(edition, target, 'choice-question', this.bank, { replaceLocked: target.allowManualReplacement ?? false, assignments });
    }
    regenerateFromPlan(edition, plan, at) {
        if (JSON.stringify(validateEdition(edition)) !== plan.baseline)
            fail('La edición cambió desde la previsualización');
        if (this.bank.manifest.id !== plan.bankId || this.bank.manifest.revision !== plan.bankRevision) {
            fail('La revisión del banco ha cambiado');
        }
        const p = getPlacement(edition, plan.target.placementId), q = getQuestion(p, plan.target.questionId);
        if (plan.kind === 'morph') {
            if (q.kind !== 'morphology' || !plan.wordId || !plan.morphCandidateId)
                fail('Plan morfológico inválido');
            const word = q.words.find(x => x.id === plan.wordId) ?? fail('Forma inexistente');
            const row = this.bank.findVerified(plan.morphCandidateId);
            if (!row || row.kind !== 'morphology' || row.surface !== word.surface || !row.analysis || !row.lemmaId)
                fail('Análisis fuera del banco verificado');
            return regenerateMorph(edition, p.id, q.id, word.id, { lemmaId: row.lemmaId, analysis: row.analysis,
                provenance: row.evidence, reviewState: 'verified' }, at, plan.replaceLocked);
        }
        if (q.kind !== 'choice')
            fail('El objetivo no es una pregunta de elección');
        const modified = structuredClone(q);
        const used = new Set();
        for (const a of plan.assignments) {
            const option = getOption(modified, a.optionId);
            if (plan.kind === 'slot' && a.items.length !== 1)
                fail('Un botón individual no puede cambiar más de una palabra');
            const original = getOption(q, a.optionId);
            if (plan.kind === 'slot') {
                const candidate = a.items[0];
                const slot = original.slots.find(s => s.id === candidate.slotId) ?? fail('Casilla inexistente');
                if (slot.locked && !plan.replaceLocked)
                    fail('Casilla protegida manualmente');
                if (candidate.candidateId === null)
                    fail('Falta propuesta de palabra individual');
                const row = this.bank.findVerified(candidate.candidateId);
                if (!row || !validSlotRecord(row, option.kind, candidate.sourceForm, plan.target.phoneticRules))
                    fail('Propuesta académica no válida');
                if (normalize(row.value) === normalize(slot.value))
                    fail('La propuesta no cambia la palabra');
                const taken = existingValues(q, [slot.id]);
                if (taken.has(normalize(row.value)))
                    fail('La palabra ya aparece en otro apartado');
                return regenerateSlot(edition, p.id, q.id, a.optionId, slot.id, { value: row.value, proposedLemmaId: row.lemmaId, provenance: row.evidence }, at, plan.replaceLocked);
            }
            const slots = [];
            for (const entry of a.items) {
                const old = original.slots.find(s => s.id === entry.slotId);
                if (entry.candidateId === null) {
                    if (!old?.locked || plan.replaceLocked)
                        fail('No se puede conservar una casilla no protegida sin candidato');
                    slots.push(old);
                    continue;
                }
                if (old?.locked && !plan.replaceLocked)
                    fail('No se puede sustituir una palabra protegida');
                const row = this.bank.findVerified(entry.candidateId);
                if (!row || !validSlotRecord(row, option.kind, entry.sourceForm, plan.target.phoneticRules))
                    fail('Propuesta fuera de banco/curso/fuente');
                const valueKey = normalize(row.value);
                if (used.has(valueKey))
                    fail('Dos casillas recibirían la misma palabra');
                used.add(valueKey);
                if (old && valueKey === normalize(old.value))
                    fail('La regeneración no cambia el valor');
                slots.push({ id: entry.slotId, value: row.value, proposedLemmaId: row.lemmaId,
                    origin: 'generated', locked: false, provenance: row.evidence });
            }
            option.slots = slots;
        }
        if (plan.kind === 'subquestion') {
            if (plan.assignments.length !== 1 || !plan.optionId || plan.optionId !== plan.assignments[0]?.optionId) {
                fail('El plan no identifica un apartado único');
            }
            const a = plan.assignments[0];
            const targetOption = getOption(modified, a.optionId);
            const others = existingValues(q, getOption(q, a.optionId).slots.map(s => s.id));
            for (const s of targetOption.slots)
                if (others.has(normalize(s.value)))
                    fail('La propuesta duplica una palabra del resto');
            // La operación granular existente solo admite candidatos generados.
            // Si preservamos un término manual intacto, aplicamos la pregunta
            // construida con el único subapartado cambiado (ningún otro difiere).
            if (targetOption.slots.some(s => s.origin === 'manual')) {
                return regenerateQuestion(edition, p.id, q.id, modified, at, plan.replaceLocked ? 'replace-confirmed' : 'preserve');
            }
            return regenerateSubquestion(edition, p.id, q.id, a.optionId, targetOption.slots, at, plan.replaceLocked ? 'replace-confirmed' : 'preserve');
        }
        if (plan.kind !== 'choice-question')
            fail('Operación académica desconocida');
        if (new Set(plan.assignments.map(a => a.optionId)).size !== plan.assignments.length) {
            fail('Un apartado aparece repetido en el plan');
        }
        for (const o of q.options) {
            if (o.enabled && !plan.assignments.some(a => a.optionId === o.id))
                fail('Falta un apartado activo');
        }
        // No se admiten candidatos que dupliquen un término conservado.
        const changed = new Set(plan.assignments.flatMap(a => a.items.filter(i => i.candidateId !== null).map(i => i.slotId)));
        const preserved = new Set(q.options.flatMap(o => o.slots.filter(s => !changed.has(s.id)).map(s => normalize(s.value))));
        for (const o of modified.options)
            for (const slot of o.slots) {
                if (changed.has(slot.id) && preserved.has(normalize(slot.value))) {
                    fail('La propuesta duplica una palabra conservada');
                }
            }
        // Una propuesta completa conserva los enunciados, apartados desactivados y la puntuación.
        return regenerateQuestion(edition, p.id, q.id, modified, at, plan.replaceLocked ? 'replace-confirmed' : 'preserve');
    }
    /** Revalida las propuestas dentro del CAS; no se espera al proveedor durante la transacción. */
    async commit(repo, plan, at) {
        if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(at)
            || Number.isNaN(Date.parse(at)) || new Date(at).toISOString() !== at) {
            fail('Fecha de confirmación inválida');
        }
        if (!plan || !plan.editionId || plan.editionId !== this.editionId(plan.baseline)) {
            fail('El plan pertenece a otra edición');
        }
        return repo.commitEdition(plan.editionId, plan.target.expectedRevision, { command: `academic.${plan.kind}`, targetId: plan.wordId ?? plan.optionId ?? plan.target.questionId, timestamp: at }, previous => {
            if (!previous)
                fail('El cuaderno ya no existe');
            return this.regenerateFromPlan(previous, plan, at);
        });
    }
    editionId(baseline) {
        try {
            return validateEdition(JSON.parse(baseline)).id;
        }
        catch {
            return fail('Instantánea inicial corrupta');
        }
    }
}
