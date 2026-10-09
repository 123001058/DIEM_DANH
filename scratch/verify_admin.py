with open('admin.html', 'r', encoding='utf-8') as f:
    content = f.read()

print("Script tags open:", content.count("<script"))
print("Script tags close:", content.count("</script>"))
print("Views:")
for line in content.splitlines():
    if 'class="app-view' in line:
        print(" -", line.strip())
