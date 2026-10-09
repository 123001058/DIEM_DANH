import re

with open('admin.html', 'r', encoding='utf-8') as f:
    text = f.read()

# Let's clean up any duplicate or misplaced scripts in <head>
# First, let's locate the head closing tag </head>
head_idx = text.find('</head>')
if head_idx == -1:
    raise Exception("Could not find </head>")

head_part = text[:head_idx]
body_and_script_part = text[head_idx:]

# In head_part, let's ensure <head> ends cleanly with:
# <script src="js/qrcode.min.js"></script>
# <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
# <script src="js/config.js?v=6"></script>
# </head>

# Remove any accidental inline JS injected into head_part
if '// Register view titles for routing' in head_part:
    head_part = re.sub(r'<script src="js/config\.js\?v=6">.*?</script>', '<script src="js/config.js?v=6"></script>', head_part, flags=re.DOTALL)
    head_part = re.sub(r'// Register view titles for routing.*?</script>', '', head_part, flags=re.DOTALL)
    head_part = re.sub(r'/\* ==========================================================\s*ROBOCON RULES.*?</script>', '', head_part, flags=re.DOTALL)

# Reconstruct clean admin.html
# Let's ensure the main script tag at the bottom has all the helpers
cleaned_text = head_part + body_and_script_part

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(cleaned_text)

print("Cleaned admin.html")
