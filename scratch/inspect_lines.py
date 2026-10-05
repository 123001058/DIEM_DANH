import sys
path = r'c:\Users\ACER\Documents\GitHub\DIEM_DANH\supabase\schema.sql'
lines = open(path, encoding='utf-8').read().split('\n')
start = int(sys.argv[1]) if len(sys.argv) > 1 else 334
end = int(sys.argv[2]) if len(sys.argv) > 2 else 490
for i in range(start-1, min(end, len(lines))):
    l = lines[i]
    print(str(i+1).rjust(4) + ' | ' + l.encode('utf-8', errors='replace').decode('ascii'))
