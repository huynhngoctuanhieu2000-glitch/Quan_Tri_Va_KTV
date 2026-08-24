
import re

with open('app/reception/dispatch/page.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

find_regex = re.compile(
    r'if\s*\(groups\.size\s*>\s*1\)\s*\{\s*splitPlan\s*=\s*Array\.from\(groups\.values\(\)\)\.map\(\(itemIds,\s*idx\)\s*=>\s*\{\s*const\s*subOrd\s*=\s*subOrders\.find\(s\s*=>\s*s\.originalOrder\.id\s*===\s*clonedOrder\.id\s*&&\s*s\.services\.some\(svc\s*=>\s*itemIds\.includes\(svc\.id\)\)\);\s*const\s*suffix\s*=\s*subOrd\?\.subSuffix\s*\|\|\s*String\.fromCharCode\(65\s*\+\s*idx\);\s*return\s*\{\s*suffix,\s*itemIds\s*\};\s*\}\);\s*\}'
)

replace_text = '''if (groups.size > 1) {
                const usedSuffixes = new Set<string>();
                splitPlan = Array.from(groups.values()).map((itemIds, idx) => {
                    const subOrd = subOrders.find(s => s.originalOrder.id === clonedOrder.id && s.services.some(svc => itemIds.includes(svc.id)));
                    let suffix = subOrd?.subSuffix;
                    if (!suffix || usedSuffixes.has(suffix)) {
                        for (let i = 0; i < 26; i++) {
                            const char = String.fromCharCode(65 + i);
                            if (!usedSuffixes.has(char)) {
                                suffix = char;
                                break;
                            }
                        }
                    }
                    usedSuffixes.add(suffix!);
                    return { suffix: suffix!, itemIds };
                });
            }'''

text, count = find_regex.subn(replace_text, text)
print(f'Replaced {count} occurrences')

with open('app/reception/dispatch/page.tsx', 'w', encoding='utf-8') as f:
    f.write(text)

