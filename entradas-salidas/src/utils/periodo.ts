export function periodoActual(date = new Date()) {
    const d = new Date(date);
    const dia = d.getDate();
    const base = new Date(d.getFullYear(), d.getMonth(), dia >= 15 ? 15 : 15);
    if (dia < 15) base.setMonth(base.getMonth() - 1);

    const ini = new Date(base); // 15
    const fin = new Date(base); fin.setMonth(fin.getMonth() + 1); fin.setDate(14);

    const toISO = (x: Date) => x.toISOString().slice(0, 10);
    return { inicio: ini, fin, inicioISO: toISO(ini), finISO: toISO(fin) };
}
