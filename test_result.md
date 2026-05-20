#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: |
  Verify the new behavior of POST /api/todos/{todo_id}/proof — when a non-owner (recipient)
  uploads proof photos for a shared todo, the owner should receive a new in-app notification
  with type "proof_added", title "Proof Added", and a body containing the recipient's name
  and the photo count ("N photos"). When the owner uploads their own proof, no notification
  should be created. Also verify existing auth/login, todo CRUD, share, and toggle-complete
  flows still work.

backend:
  - task: "POST /api/todos/{id}/proof - notify owner when recipient adds proof"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "testing"
          comment: |
            Verified end-to-end at https://task-share-hub-2.preview.emergentagent.com/api with
            reviewer@todoshare.app (Owner A) and reviewer2@todoshare.app (Recipient B,
            USR-VDQMUZ). Owner created a todo, shared with recipient, recipient marked complete
            and POSTed two base64 images to /api/todos/{id}/proof.
            Response: 200, todo.completion_proofs contained recipient entry with 2 images.
            Owner GET /api/notifications returned a NEW notification:
              type=proof_added, title="Proof Added",
              body="Reviewer Helper added 2 photos for: Proof Notification Test ...",
              read=False.
            unread-count increased correctly (0 -> 2 including the 'completed' notif).
            Edge case verified: when Owner A POSTs proof on their own todo, NO new
            'proof_added' notification is created for the owner.

  - task: "Auth: login / register / me"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "testing"
          comment: |
            Login works for both seeded reviewer accounts. Register with a valid TLD email
            succeeds and returns a JWT + user_code. (Note: pydantic EmailStr rejects reserved
            TLDs like .test - this is correct strict validation, not a bug.)

  - task: "Todos: create / list / share / shared list"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "testing"
          comment: |
            POST /api/todos returns todo, GET /api/todos lists it for owner.
            POST /api/todos/{id}/share with USR-VDQMUZ succeeds (200) and adds recipient to
            shared_with. Recipient sees it via GET /api/todos/shared.

  - task: "Toggle complete still notifies owner"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
        - working: true
          agent: "testing"
          comment: |
            PATCH /api/todos/{id}/complete by recipient set sw.completed=true and inserted a
            'completed' in-app notification for the owner (verified via GET /api/notifications).

  - task: "Notifications: list / unread-count"
    implemented: true
    working: true
    file: "backend/server.py"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
        - working: true
          agent: "testing"
          comment: |
            GET /api/notifications returns notifications sorted newest first.
            GET /api/notifications/unread-count returns correct count including the new
            proof_added notification. Cleanup via DELETE /api/todos/{id} removes the todo and
            its notifications (returns 200).

metadata:
  created_by: "testing_agent"
  version: "1.0"
  test_sequence: 1
  run_ui: false

test_plan:
  current_focus: []
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

agent_communication:
    - agent: "testing"
      message: |
        Ran /app/backend_test.py against the public preview URL. 21/21 backend assertions
        passed. The new proof_added owner-notification feature works exactly as specified:
        title "Proof Added", body contains recipient name and "2 photos", and no
        self-notification when owner uploads their own proof. Existing auth, todo CRUD,
        share, toggle-complete, and notifications endpoints all still work.
        No regressions found.