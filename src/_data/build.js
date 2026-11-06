const nu = new Date();
const stockholm = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", year: "numeric", month: "2-digit", day: "2-digit" }).format(nu);
export default { datum: stockholm, tid: nu.toISOString() };
