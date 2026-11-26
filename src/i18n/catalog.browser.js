const modules = import.meta.glob('./en/*.json', { eager: true, import: 'default' });
export default Object.fromEntries(Object.entries(modules).map(([path, dict]) => [path.split('/').pop().slice(0, -5), dict]));
