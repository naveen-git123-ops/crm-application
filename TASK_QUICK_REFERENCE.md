# Quick Start - Task Management Features

## 📌 Opening a Task - Step by Step

```
┌─────────────────────────────────────────────────────────────┐
│  TASK BOARD VIEW                                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Pending          │  In Progress     │  Completed          │
│  ┌──────────────┐ │ ┌──────────────┐ │ ┌──────────────┐   │
│  │  Task Card   │ │ │  Task Card   │ │ │  Task Card   │   │
│  │              │ │ │              │ │ │              │   │
│  │ Click HERE! ←─┼─┼─ ANYWHERE    │ │ │              │   │
│  │              │ │ │              │ │ │              │   │
│  └──────────────┘ │ └──────────────┘ │ └──────────────┘   │
│                   │                   │                     │
└─────────────────────────────────────────────────────────────┘
                             │
                             │ Task Details Panel Slides In
                             ↓
                    ┌────────────────────┐
                    │ TASK DETAILS PANEL  │
                    ├────────────────────┤
                    │ Task ID: T-001      │
                    │ Title: Sample Task  │
                    │                    │
                    │ [Details] [Comments]│
                    │ [Time] [Attachments]│
                    │                    │
                    │ ✏️ Edit Task       │
                    │                    │
                    │ [Save/Cancel Btns] │
                    │                    │
                    │              [X] ← Click to Close
                    └────────────────────┘
```

## ✏️ Editing a Task

```
1. Click on task card
                    ↓
2. Click "Edit Task" button (pencil icon)
                    ↓
3. Modify fields:
   ┌─────────────────────────────────────┐
   │ Title: [Input field]                │
   │ Description: [Large text area]      │
   │ Priority: [Dropdown]                │
   │ Status: [Dropdown]                  │
   │ Due Date: [Date picker]             │
   │ Completion %: [Slider 0-100]  ←─────┤ Drag to set
   └─────────────────────────────────────┘
                    ↓
4. Click "Save" button (green)
                    ↓
✓ Success! Task updated
```

## 💬 Adding Comments

```
1. Open task (click on card)
                    ↓
2. Click "Comments" tab
                    ↓
3. Type in text field at top
   ┌─────────────────────────────────────┐
   │ [Text Input Field]          [Send ➤]│  ← Type here and click send
   └─────────────────────────────────────┘
                    ↓
4. View all comments below:
   ┌─────────────────────────────────────┐
   │ John Doe                  Feb 23     │
   │ "This task is important"            │
   ├─────────────────────────────────────┤
   │ Jane Smith                 Feb 23    │
   │ "I'll start on this tomorrow"       │
   └─────────────────────────────────────┘
```

## 📎 Adding Attachments

```
1. Open task (click on card)
                    ↓
2. Click "Attachments" tab
                    ↓
3. Upload file:
                    ↓
   Click Box or Drag & Drop File
   ┌──────────────────────────────────┐
   │                                  │
   │    Click to upload or drag files │
   │         📎  Drop here            │
   │                                  │
   └──────────────────────────────────┘
                    ↓
4. View uploaded files:
   ┌──────────────────────────────────┐
   │ document.pdf                     │
   │ Uploaded by John • Feb 23    [📥]│  ← Click download icon
   ├──────────────────────────────────┤
   │ image.png                        │
   │ Uploaded by Jane • Feb 23    [📥]│
   └──────────────────────────────────┘
```

## ⏱️ Logging Time

```
1. Open task (click on card)
                    ↓
2. Click "Time" tab
                    ↓
3. Fill in the form:
   ┌─────────────────────────────────────┐
   │ Date: [📅 Pick date]                │
   │ Time Spent (minutes): [Input]       │  ← e.g., "60" for 1 hour
   │ Description: [Optional text]        │
   │ [Log Time Button]                   │
   └─────────────────────────────────────┘
                    ↓
4. See time logs:
   ┌─────────────────────────────────────┐
   │ John Doe • Feb 23                   │
   │ 120 minutes - "Completed design"    │
   ├─────────────────────────────────────┤
   │ Jane Smith • Feb 22                 │
   │ 60 minutes - "Setup environment"    │
   └─────────────────────────────────────┘
```

## 📊 Using the Dashboard (Admin/Manager Only)

```
HEADER NAVIGATION:
┌──────────────────────────────────────────┐
│ [Board] [Dashboard] ← Switch between views
│         Employee Filter ↓
│         [All Employees ▼]  ← Select employee
└──────────────────────────────────────────┘

SUMMARY CARDS:
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│ Total   │ Pending │In Prog. │Complete │ Overdue │
│  42     │   15    │   20    │    5    │    2    │
└─────────┴─────────┴─────────┴─────────┴─────────┘

EMPLOYEE TABLE:
┌──────────┬────┬────┬─────┬──────┬────────┬──────────────┐
│ Employee │Tot │Pen │InPg │Comp  │Overdue │Avg Compl. %  │
├──────────┼────┼────┼─────┼──────┼────────┼──────────────┤
│ John     │ 10 │ 5  │  3  │  2   │  0     │ ████░░ 60%   │
├──────────┼────┼────┼─────┼──────┼────────┼──────────────┤
│ Jane     │  8 │ 2  │  4  │  2   │  0     │ ██████░ 75%  │
└──────────┴────┴────┴─────┴──────┴────────┴──────────────┘

CLICK TO FILTER:
Step 1: Select employee name from dropdown ↑
Step 2: Board changes to show only their tasks
Step 3: See task list below with completion %
```

## 🔴 Common Issues & Solutions

### "Task won't open when I click it"
**Solution:**
- Make sure you're in **Board View** (not Dashboard)
- Click directly on the task card
- The panel should slide in from the RIGHT side
- Look for the task details on the right side of your screen

### "I don't see the Comments/Attachments/Time tabs"
**Solution:**
- Tabs are INSIDE the task details panel
- Open a task first
- Look at the top of the panel for: Details | Comments | Time | Attachments
- Click on the tab you want

### "Edit button not showing"
**Solution:**
- Make sure you're on the "Details" tab
- Click "Edit Task" button (should show pencil icon ✏️)
- Once clicked, fields become editable and Save/Cancel buttons appear

### "Changes didn't save"
**Solution:**
- You MUST click the green "Save" button
- Look for success notification (green toast message)
- If you see an error, check all required fields are filled
- Try refreshing the page

### "Can't upload files"
**Solution:**
- You must be on the "Attachments" tab
- Click or drag into the dashed box area
- Wait for upload to complete (success message)
- Check file size isn't too large

## 🎯 Keyboard Shortcuts (Future)
(Not yet implemented, but planned)
- `Esc` - Close task panel
- `Ctrl+S` - Save changes quickly

## 📱 Mobile Notes
- Drag and drop works on mobile browsers
- Task panel appears full-screen on mobile
- All features work the same on mobile

---

**Need help?** Check the full user guide in `TASK_USAGE_GUIDE.md`
