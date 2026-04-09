# 재고관리 시스템

중소기업/소상공인을 위한 입고·출고·재고·거래처·매출 통합 관리 웹 애플리케이션입니다.

---

## 주요 기능

| 기능 | 설명 |
|------|------|
| 재고 현황 | 브랜드/모델/스펙/상태별 재고 조회 및 수동 조정 |
| 입고 관리 | 직접 입력 또는 엑셀 업로드로 매입 등록 |
| 출고 관리 | 출고 등록, 거래명세서 출력 |
| 반품/불량 | 반품·교환·불량 처리 |
| 거래처 관리 | 매입거래처·출고거래처 등록/조회, 사업자등록증 첨부 |
| 매출/수익 | 기간별 매출·매입·수익 집계 |
| 사용자 관리 | 역할(admin/editor/viewer) 기반 계정 관리 |
| 휴지통 | 삭제 항목 30일 보관 후 자동 영구삭제, 복구 가능 |
| 감사로그 | 모든 등록·수정·삭제 이력 자동 기록 및 조회 |

---

## 기술 스택

- **Backend**: Node.js (v22+), Express
- **Database**: SQLite (로컬) / PostgreSQL (배포)
- **Frontend**: Vanilla JS SPA, Flatpickr, SheetJS, Chart.js
- **인증**: JWT (localStorage)
- **파일 업로드**: Multer
- **스케줄러**: node-cron

---

## 설치 방법

### 1. 저장소 클론

```bash
git clone https://github.com/your-org/inventory-system.git
cd inventory-system
```

### 2. 의존성 설치

```bash
npm install
```

### 3. 환경변수 설정

```bash
cp .env.example .env
```

`.env` 파일을 열어 아래 값을 설정합니다.

---

## 환경변수 설명

| 변수 | 필수 | 설명 |
|------|------|------|
| `NODE_ENV` | - | `development` 또는 `production` |
| `PORT` | - | 서버 포트 (기본값: 3000) |
| `ADMIN_ID` | ✅ | 최초 관리자 계정 아이디 |
| `ADMIN_PW` | ✅ | 최초 관리자 계정 비밀번호 (8자 이상) |
| `JWT_SECRET` | ✅ | JWT 서명 시크릿 (`openssl rand -hex 32` 로 생성) |
| `DATABASE_URL` | - | PostgreSQL 연결 URL. 비워두면 SQLite 사용 |

### .env 예시

```env
NODE_ENV=production
PORT=3000

ADMIN_ID=admin
ADMIN_PW=your_secure_password

JWT_SECRET=your_jwt_secret_here

# 로컬: 비워두면 SQLite 자동 사용
# 배포: Railway 등에서 자동 주입
DATABASE_URL=
```

---

## 실행 방법

### 개발 서버 (자동 재시작)

```bash
npm run dev
```

### 프로덕션 서버

```bash
npm start
```

서버 기동 후 브라우저에서 [http://localhost:3000](http://localhost:3000) 접속

---

## 역할별 권한

| 역할 | 접근 가능 메뉴 |
|------|--------------|
| `admin` | 전체 (사용자 관리, 휴지통, 감사로그 포함) |
| `editor` | 재고·입고·출고·반품·거래처·매출·회사정보 |
| `viewer` | 재고 현황·대시보드·회사정보 |

---

## Railway 배포 방법

1. [Railway](https://railway.app) 에서 새 프로젝트 생성
2. GitHub 저장소 연결
3. **PostgreSQL 플러그인** 추가 → `DATABASE_URL` 자동 주입됨
4. 환경변수 설정 (`ADMIN_ID`, `ADMIN_PW`, `JWT_SECRET`, `NODE_ENV=production`)
5. 배포 완료 후 제공된 URL로 접속

> `DATABASE_URL` 이 설정되면 자동으로 PostgreSQL을 사용합니다.  
> 최초 서버 시작 시 테이블과 관리자 계정이 자동 생성됩니다.

---

## 파일 구조

```
inventory-system/
├── routes/           # API 라우터
│   ├── auth.js
│   ├── inbound.js
│   ├── outbound.js
│   ├── returns.js
│   ├── inventory.js
│   ├── sales.js
│   ├── vendorFactory.js
│   ├── trash.js
│   ├── auditLog.js
│   ├── company.js
│   └── dashboard.js
├── middleware/
│   ├── auth.js       # JWT 인증
│   └── audit.js      # 감사로그·휴지통 유틸
├── db/
│   └── database.js   # DB 초기화·마이그레이션
├── public/           # 정적 파일 (SPA)
│   ├── index.html
│   ├── css/style.css
│   └── js/
├── uploads/          # 사업자등록증 등 업로드 파일
├── server.js         # 서버 진입점
├── .env.example
└── package.json
```
