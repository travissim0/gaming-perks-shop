# 🚀 Gaming Perks Shop - Quick Setup Commands

## One-Liner Setup (Windows PowerShell)

### **Method 1: Download and Run Script**
```powershell
iwr -Uri "https://raw.githubusercontent.com/travissim0/gaming-perks-shop/main/setup-gaming-perks-shop.ps1" -OutFile "setup.ps1"; Set-ExecutionPolicy Bypass -Scope Process -Force; .\setup.ps1
```

### **Method 2: Direct Commands**
```powershell
# Remove broken Chocolatey (if exists)
Remove-Item "C:\ProgramData\chocolatey" -Recurse -Force -ErrorAction SilentlyContinue

# Install Chocolatey
Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install Git and Node.js
choco install git nodejs -y

# Clone and setup project
git clone https://github.com/travissim0/gaming-perks-shop; cd gaming-perks-shop; npm install

# Create environment file template
@"
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
"@ | Out-File -FilePath ".env.local" -Encoding UTF8

# Start development server
npm run dev
```

### **Method 3: Step by Step (If automation fails)**
1. **Install Prerequisites:**
   - Download Git: https://git-scm.com/download/win
   - Download Node.js: https://nodejs.org/ (LTS version)
   - Install both with default settings
   - Restart PowerShell

2. **Setup Project:**
   ```powershell
   git clone https://github.com/travissim0/gaming-perks-shop
   cd gaming-perks-shop
   npm install
   ```

3. **Create Environment File:**
   ```powershell
   notepad .env.local
   ```
   Add your Supabase credentials:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
   ```

4. **Start Development Server:**
   ```powershell
   npm run dev
   ```

## 🔧 Troubleshooting

### **"npm not recognized" after Node.js installation**
- Close and reopen PowerShell
- Or restart your computer
- Verify with: `node --version` and `npm --version`

### **"git not recognized" after Git installation**
- Close and reopen PowerShell
- Or restart your computer
- Verify with: `git --version`

### **Chocolatey installation issues**
- Run PowerShell as Administrator
- Remove existing installation: `Remove-Item "C:\ProgramData\chocolatey" -Recurse -Force`
- Try again

### **Port 3000 already in use**
```powershell
npm run dev -- -p 3001
```

## 🎯 What You Need After Setup

1. **Supabase Credentials** - Ask the project owner for:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

2. **Edit `.env.local`** with real credentials

3. **Start developing:**
   ```powershell
   npm run dev
   ```
   Then open: http://localhost:3000

---

**🆘 Need help?** Share the error message and mention which method you tried! 