import os
import shutil
import re

def build_release():
    print("=== ANTIGRAVITY RELEASE PACKAGER ===")
    src_dir = "F:/AntiGravity/MoldCutterSearch"
    
    # 1. Read index.html to find version and dependencies
    index_path = os.path.join(src_dir, 'index.html')
    if not os.path.exists(index_path):
        print("ERROR: index.html not found!")
        return

    content = open(index_path, 'r', encoding='utf-8').read()
    
    # Extract version
    v_match = re.search(r'v9\.\d+\.\d+(?:-\d+)?', content)
    if not v_match:
        print("ERROR: Could not find v9.x.x version in index.html")
        return
    version = v_match.group(0)
    print("Found Version:", version)

    # Check collision and Output directory
    dest_dir = f"F:/AntiGravity/Releases/MoldCutterSearch/{version}"
    if os.path.exists(dest_dir):
        print(f"WARNING: Release folder {dest_dir} already exists!")
        # Auto-bump patch version to prevent overwriting
        m = re.match(r'v(\d+)\.(\d+)\.(\d+)', version)
        if m:
            major, minor, patch = m.groups()
            new_patch = int(patch) + 1
            new_version = f"v{major}.{minor}.{new_patch}"
            print(f"Auto-bumping version to: {new_version} to preserve history.")
            
            # Global replace in index.html
            content = content.replace(version, new_version)
            with open(index_path, 'w', encoding='utf-8') as f:
                f.write(content)
            
            version = new_version
            dest_dir = f"F:/AntiGravity/Releases/MoldCutterSearch/{version}"
        else:
            print("ERROR: Version format not standard, cannot auto-bump!")
            return

    os.makedirs(dest_dir, exist_ok=True)

    # 2. Extract dependencies from index.html
    js_files = re.findall(r'src=[\'\"]([^\'\"]+\.js)(?:\?.*?)?[\'\"]', content)
    css_files = re.findall(r'href=[\'\"]([^\'\"]+\.css)(?:\?.*?)?[\'\"]', content)
    
    files_to_copy = ['index.html', 'server.js', 'package.json', 'package-lock.json'] + js_files + css_files
    # Add potential sourcemaps and specific known scripts gracefully
    files_to_copy.extend(['data-manager.js', 'results-card-renderer.js'])

    # Deduplicate dependencies
    files_to_copy = list(set([f for f in files_to_copy if f and not f.startswith('http')]))

    print(f"Found {len(files_to_copy)} direct linked files.")

    # 3. Directories to copy entirely
    dirs_to_copy = ['assets', 'plastic']

    # 4. Perform Copy
    copied_count = 0
    for file_rel in files_to_copy:
        src_file = os.path.join(src_dir, file_rel)
        dest_file = os.path.join(dest_dir, file_rel)
        if os.path.exists(src_file):
            os.makedirs(os.path.dirname(dest_file) or dest_dir, exist_ok=True)
            shutil.copy2(src_file, dest_file)
            copied_count += 1
        else:
            print(f"Warning: Linked file {file_rel} not found on disk.")

    for d in dirs_to_copy:
        src_d = os.path.join(src_dir, d)
        dest_d = os.path.join(dest_dir, d)
        if os.path.exists(src_d):
            shutil.copytree(src_d, dest_d, dirs_exist_ok=True)
            copied_count += 1
            print(f"Copied directory: {d}")

    print(f"=== RELEASE SUCCESSFUL ===")
    print(f"Target: {dest_dir}")
    print(f"Total entries copied: {copied_count}")

if __name__ == '__main__':
    build_release()
