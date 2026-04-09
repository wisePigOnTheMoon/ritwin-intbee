import json
import os
import subprocess
import tempfile
import uuid

from flask import Flask, jsonify, request, send_from_directory, abort

app = Flask(__name__, static_folder='.', static_url_path='')

PROBLEMS_JSON = os.path.join(os.path.dirname(__file__), 'problems.json')
PROBLEMS_DIR = os.path.join(os.path.dirname(__file__), 'problems')


def load_data():
    with open(PROBLEMS_JSON, 'r') as f:
        return json.load(f)


def save_data(data):
    with open(PROBLEMS_JSON, 'w') as f:
        json.dump(data, f, indent=2)
        f.write('\n')


def slugify(text):
    return text.lower().replace(' ', '-').replace('#', '').strip('-')


def compile_typst(source):
    """Compile Typst source to SVG, return SVG string."""
    wrapped = f'#set page(width: auto, height: auto, margin: 1em)\n#set text(size: 24pt)\n{source}'
    with tempfile.TemporaryDirectory() as tmpdir:
        typ_path = os.path.join(tmpdir, 'input.typ')
        svg_path = os.path.join(tmpdir, 'input.svg')
        with open(typ_path, 'w') as f:
            f.write(wrapped)
        try:
            result = subprocess.run(
                ['typst', 'compile', typ_path, svg_path],
                capture_output=True, text=True, timeout=30,
            )
        except FileNotFoundError:
            return None, 'typst is not installed. Run: brew install typst'
        if result.returncode != 0:
            return None, result.stderr
        with open(svg_path, 'r') as f:
            return f.read(), None


# ── Static file serving ──

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/admin.html')
def admin_page():
    return send_from_directory('.', 'admin.html')


# ── API ──

@app.route('/api/problems', methods=['GET'])
def get_problems():
    return jsonify(load_data())


@app.route('/api/title', methods=['PUT'])
def update_title():
    data = load_data()
    body = request.get_json()
    data['title'] = body.get('title', data['title'])
    save_data(data)
    return jsonify({'ok': True})


@app.route('/api/rounds', methods=['POST'])
def create_round():
    data = load_data()
    body = request.get_json()
    name = body.get('name', 'New Round')
    data['rounds'].append({'name': name, 'problems': []})
    save_data(data)
    return jsonify({'ok': True, 'index': len(data['rounds']) - 1})


@app.route('/api/rounds/<int:index>', methods=['PUT'])
def update_round(index):
    data = load_data()
    if index < 0 or index >= len(data['rounds']):
        abort(404)
    body = request.get_json()
    if 'name' in body:
        data['rounds'][index]['name'] = body['name']
    save_data(data)
    return jsonify({'ok': True})


@app.route('/api/rounds/<int:index>', methods=['DELETE'])
def delete_round(index):
    data = load_data()
    if index < 0 or index >= len(data['rounds']):
        abort(404)
    rnd = data['rounds'].pop(index)
    save_data(data)
    # Clean up problem files
    for p in rnd['problems']:
        for key in ('problem', 'answer'):
            path = os.path.join(os.path.dirname(__file__), p[key])
            if os.path.exists(path):
                os.remove(path)
    return jsonify({'ok': True})


def _save_problem_field(field_prefix, form, files, problem_id):
    """Handle saving a problem or answer field. Returns (file_path, typst_source, error)."""
    typst_key = f'{field_prefix}_typst'
    file_key = f'{field_prefix}_file'

    if typst_key in form and form[typst_key].strip():
        typst_source = form[typst_key]
        svg_content, err = compile_typst(typst_source)
        if err:
            return None, None, err
        filename = f'{problem_id}-{field_prefix}.svg'
        filepath = os.path.join(PROBLEMS_DIR, filename)
        with open(filepath, 'w') as f:
            f.write(svg_content)
        return f'problems/{filename}', typst_source, None
    elif file_key in files:
        uploaded = files[file_key]
        ext = os.path.splitext(uploaded.filename)[1] or '.svg'
        filename = f'{problem_id}-{field_prefix}{ext}'
        filepath = os.path.join(PROBLEMS_DIR, filename)
        uploaded.save(filepath)
        return f'problems/{filename}', None, None
    return None, None, None


@app.route('/api/rounds/<int:round_index>/problems', methods=['POST'])
def add_problem(round_index):
    data = load_data()
    if round_index < 0 or round_index >= len(data['rounds']):
        abort(404)

    rnd = data['rounds'][round_index]
    label = request.form.get('label', f'{rnd["name"]} #{len(rnd["problems"]) + 1}')
    problem_id = slugify(rnd['name']) + '-' + str(len(rnd['problems']) + 1)

    # Ensure unique id
    existing_ids = {p['id'] for r in data['rounds'] for p in r['problems']}
    base_id = problem_id
    counter = 1
    while problem_id in existing_ids:
        counter += 1
        problem_id = f'{base_id}-{counter}'

    problem_path, problem_typst, err = _save_problem_field('problem', request.form, request.files, problem_id)
    if err:
        return jsonify({'error': f'Problem compilation failed: {err}'}), 400
    if not problem_path:
        return jsonify({'error': 'No problem image or Typst source provided'}), 400

    answer_path, answer_typst, err = _save_problem_field('answer', request.form, request.files, problem_id)
    if err:
        return jsonify({'error': f'Answer compilation failed: {err}'}), 400
    if not answer_path:
        return jsonify({'error': 'No answer image or Typst source provided'}), 400

    entry = {
        'id': problem_id,
        'label': label,
        'problem': problem_path,
        'answer': answer_path,
    }
    if problem_typst:
        entry['problem_typst'] = problem_typst
    if answer_typst:
        entry['answer_typst'] = answer_typst
    rnd['problems'].append(entry)
    save_data(data)
    return jsonify({'ok': True, 'problem': entry})


@app.route('/api/rounds/<int:round_index>/problems/<int:problem_index>', methods=['PUT'])
def update_problem(round_index, problem_index):
    data = load_data()
    if round_index < 0 or round_index >= len(data['rounds']):
        abort(404)
    rnd = data['rounds'][round_index]
    if problem_index < 0 or problem_index >= len(rnd['problems']):
        abort(404)

    entry = rnd['problems'][problem_index]

    if 'label' in request.form:
        entry['label'] = request.form['label']

    # Update problem field if provided
    new_problem, new_problem_typst, err = _save_problem_field('problem', request.form, request.files, entry['id'])
    if err:
        return jsonify({'error': f'Problem compilation failed: {err}'}), 400
    if new_problem:
        old_path = os.path.join(os.path.dirname(__file__), entry['problem'])
        if os.path.exists(old_path) and new_problem != entry['problem']:
            os.remove(old_path)
        entry['problem'] = new_problem
        if new_problem_typst:
            entry['problem_typst'] = new_problem_typst

    # Update answer field if provided
    new_answer, new_answer_typst, err = _save_problem_field('answer', request.form, request.files, entry['id'])
    if err:
        return jsonify({'error': f'Answer compilation failed: {err}'}), 400
    if new_answer:
        old_path = os.path.join(os.path.dirname(__file__), entry['answer'])
        if os.path.exists(old_path) and new_answer != entry['answer']:
            os.remove(old_path)
        entry['answer'] = new_answer
        if new_answer_typst:
            entry['answer_typst'] = new_answer_typst

    save_data(data)
    return jsonify({'ok': True, 'problem': entry})


@app.route('/api/rounds/<int:round_index>/problems/<int:problem_index>', methods=['DELETE'])
def delete_problem(round_index, problem_index):
    data = load_data()
    if round_index < 0 or round_index >= len(data['rounds']):
        abort(404)
    rnd = data['rounds'][round_index]
    if problem_index < 0 or problem_index >= len(rnd['problems']):
        abort(404)

    entry = rnd['problems'].pop(problem_index)
    save_data(data)

    for key in ('problem', 'answer'):
        path = os.path.join(os.path.dirname(__file__), entry[key])
        if os.path.exists(path):
            os.remove(path)

    return jsonify({'ok': True})


@app.route('/api/import', methods=['POST'])
def import_problems():
    """Import problems from a text file.

    Format:
        # Round Name
        problem typst | answer typst
        problem typst | answer typst

        # Another Round
        problem typst | answer typst
    """
    body = request.get_json()
    source = body.get('source', '')
    if not source.strip():
        return jsonify({'error': 'Empty source'}), 400

    # Parse the file
    rounds = []
    current_round = None

    for line in source.splitlines():
        line = line.strip()
        if not line:
            continue
        if line.startswith('#'):
            name = line.lstrip('#').strip()
            if not name:
                continue
            current_round = {'name': name, 'problems': []}
            rounds.append(current_round)
        elif '|' in line and current_round is not None:
            parts = line.split('|', 1)
            problem_src = parts[0].strip()
            answer_src = parts[1].strip()
            if problem_src and answer_src:
                current_round['problems'].append({
                    'problem_typst': problem_src,
                    'answer_typst': answer_src,
                })

    if not rounds:
        return jsonify({'error': 'No rounds found. Use "# Round Name" to start a round.'}), 400

    total_problems = sum(len(r['problems']) for r in rounds)
    if total_problems == 0:
        return jsonify({'error': 'No problems found. Use "problem typst | answer typst" format.'}), 400

    # Compile everything
    data = load_data()
    errors = []
    created = 0

    for rnd_def in rounds:
        # Create round
        rnd = {'name': rnd_def['name'], 'problems': []}
        round_index = len(data['rounds'])
        data['rounds'].append(rnd)

        for i, prob_def in enumerate(rnd_def['problems']):
            problem_id = slugify(rnd_def['name']) + '-' + str(i + 1)
            # Ensure unique id
            existing_ids = {p['id'] for r in data['rounds'] for p in r['problems']}
            base_id = problem_id
            counter = 1
            while problem_id in existing_ids:
                counter += 1
                problem_id = f'{base_id}-{counter}'

            label = f'{rnd_def["name"]} #{i + 1}'

            # Compile problem
            svg, err = compile_typst(prob_def['problem_typst'])
            if err:
                errors.append(f'{label} problem: {err}')
                continue
            prob_filename = f'{problem_id}-problem.svg'
            with open(os.path.join(PROBLEMS_DIR, prob_filename), 'w') as f:
                f.write(svg)

            # Compile answer
            svg, err = compile_typst(prob_def['answer_typst'])
            if err:
                errors.append(f'{label} answer: {err}')
                # Clean up problem file
                os.remove(os.path.join(PROBLEMS_DIR, prob_filename))
                continue
            ans_filename = f'{problem_id}-answer.svg'
            with open(os.path.join(PROBLEMS_DIR, ans_filename), 'w') as f:
                f.write(svg)

            entry = {
                'id': problem_id,
                'label': label,
                'problem': f'problems/{prob_filename}',
                'answer': f'problems/{ans_filename}',
                'problem_typst': prob_def['problem_typst'],
                'answer_typst': prob_def['answer_typst'],
            }
            rnd['problems'].append(entry)
            created += 1

    save_data(data)

    result = {'ok': True, 'created': created}
    if errors:
        result['errors'] = errors
    return jsonify(result)


@app.route('/api/regenerate', methods=['POST'])
def regenerate_images():
    """Regenerate SVG images from stored typst sources for all problems."""
    data = load_data()
    regenerated = 0
    errors = []

    for rnd in data['rounds']:
        for entry in rnd['problems']:
            for field in ('problem', 'answer'):
                typst_key = f'{field}_typst'
                if typst_key not in entry or not entry[typst_key]:
                    continue
                svg, err = compile_typst(entry[typst_key])
                if err:
                    errors.append(f'{entry["label"]} {field}: {err}')
                    continue
                filename = f'{entry["id"]}-{field}.svg'
                filepath = os.path.join(PROBLEMS_DIR, filename)
                with open(filepath, 'w') as f:
                    f.write(svg)
                entry[field] = f'problems/{filename}'
                regenerated += 1

    save_data(data)
    result = {'ok': True, 'regenerated': regenerated}
    if errors:
        result['errors'] = errors
    return jsonify(result)


@app.route('/api/compile-typst', methods=['POST'])
def compile_typst_endpoint():
    body = request.get_json()
    source = body.get('source', '')
    if not source.strip():
        return jsonify({'error': 'Empty source'}), 400
    svg, err = compile_typst(source)
    if err:
        return jsonify({'error': err}), 400
    return jsonify({'svg': svg})


if __name__ == '__main__':
    os.makedirs(PROBLEMS_DIR, exist_ok=True)
    app.run(debug=True, port=5000)
