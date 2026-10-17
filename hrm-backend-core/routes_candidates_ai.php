<?php

function getGroqApiKey() {
    $envPath = __DIR__ . '/.env';
    if (file_exists($envPath)) {
        $env = parse_ini_file($envPath);
        return $env['GROQ_API_KEY'] ?? null;
    }
    return null;
}

Router::post('/api/candidates/{id}/ai-screen', function($id) {
    Auth::authenticate();
    $db = Database::getConnection();
    
    // Fetch candidate and job opening
    $stmt = $db->prepare("
        SELECT c.*, j.title as job_title, j.description as job_description, j.requirements as job_requirements
        FROM candidates c
        LEFT JOIN job_openings j ON c.job_opening_id = j.id
        WHERE c.id = ?
    ");
    $stmt->execute([$id]);
    $candidate = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$candidate) {
        http_response_code(404);
        echo json_encode(['error' => 'Candidate not found']);
        return;
    }

    $apiKey = getGroqApiKey();
    if (!$apiKey) {
        http_response_code(500);
        echo json_encode(['error' => 'GROQ API key not configured in .env']);
        return;
    }

    // Build the prompt
    $candidateProfile = "Name: {$candidate['first_name']} {$candidate['last_name']}\n";
    $candidateProfile .= "Qualification: {$candidate['highest_qualification']}\n";
    $candidateProfile .= "Total Experience: {$candidate['total_experience_years']} years\n";
    $candidateProfile .= "Current Designation: {$candidate['current_designation']}\n";
    $candidateProfile .= "Extracted Skills (if any): {$candidate['ai_extracted_skills']}\n";
    
    $jobProfile = "Job Title: {$candidate['job_title']}\n";
    $jobProfile .= "Job Description: {$candidate['job_description']}\n";
    $jobProfile .= "Requirements: {$candidate['job_requirements']}\n";

    $prompt = "You are an expert technical recruiter and HR assistant. Please screen the following candidate profile against the job opening details provided below.
    
Job Opening Details:
$jobProfile

Candidate Profile:
$candidateProfile

Based on this limited structured data (since full resume text may not be available), evaluate the candidate's fit for the role.

Respond ONLY with a JSON object in the exact following format:
{
  \"score\": <integer from 0 to 100 representing the match percentage>,
  \"summary\": \"<A brief paragraph explaining the strengths and weaknesses of this candidate for this role>\",
  \"extracted_skills\": \"<A comma-separated list of key skills you infer from the candidate's profile>\"
}
Do not include any markdown formatting, code blocks, or additional text.";

    // Call Groq API
    $ch = curl_init('https://api.groq.com/openai/v1/chat/completions');
    $payload = json_encode([
        "model" => "mixtral-8x7b-32768",
        "messages" => [
            [
                "role" => "user",
                "content" => $prompt
            ]
        ],
        "temperature" => 0.2,
        "response_format" => ["type" => "json_object"]
    ]);

    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Authorization: Bearer ' . $apiKey,
        'Content-Type: application/json'
    ]);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // Disable SSL for local dev
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    if ($httpCode !== 200) {
        $errorDetails = $response === false ? curl_error($ch) : $response;
        file_put_contents(__DIR__ . '/ai_error.log', $errorDetails);
        http_response_code($httpCode > 0 ? $httpCode : 500);
        echo json_encode(['error' => 'AI Provider error: ' . substr($errorDetails, 0, 100), 'details' => $errorDetails]);
        return;
    }

    $result = json_decode($response, true);
    $aiContent = $result['choices'][0]['message']['content'] ?? '{}';
    $aiData = json_decode($aiContent, true);

    $score = $aiData['score'] ?? 0;
    $summary = $aiData['summary'] ?? 'No summary provided.';
    $skills = $aiData['extracted_skills'] ?? '';

    // Update database
    $updStmt = $db->prepare("
        UPDATE candidates 
        SET ai_match_score = ?, ai_extracted_experience = ?, ai_extracted_skills = COALESCE(ai_extracted_skills, ?)
        WHERE id = ?
    ");
    $updStmt->execute([$score, $summary, $skills, $id]);

    echo json_encode([
        'message' => 'AI Screening completed successfully',
        'score' => $score,
        'summary' => $summary,
        'skills' => $skills
    ]);
});
