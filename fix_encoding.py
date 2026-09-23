import re

file_path = 'static/js/report_generator.js'

with open(file_path, 'r', encoding='windows-1252') as f:
    content = f.read()
    
# Replace invalid characters
content = content.replace('\x97', '-')
# The character in the file is likely a literal diamond question mark or similar
# Let's just use regex to replace all non-ascii characters with 'N/A' or '-' for safety if they are within strings,
# but to be safe, I'll just replace the specific string.
# The original code had: Backend: ${sysVer.backend_version || "?"} or similar.
# I will use a regex to fix sysVer.backend_version || "\ufffd"
content = re.sub(r'backend_version \|\| \".*?\"', 'backend_version || \"N/A\"', content)
content = re.sub(r'backend_version \|\| \'.*?\'', 'backend_version || \'N/A\'', content)

# Also fix the weird emojis in HTML
# We can find them:
# <p style="text-align:center;margin-top:40px;color:#666;">-- END OF REPORT --</p>
content = content.replace('❓', 'N/A')

content = content.replace('<li>Full 6DOF non-linear simulation with rigid-body dynamics and Magnus effect.</li>', '<li>Full 6DOF non-linear simulation with rigid-body dynamics and Magnus effect.</li>\n            <li>Dynamic 3D ellipsoid flight path visualization implemented with CesiumJS.</li>')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated report_generator.js to UTF-8 and fixed symbols')
