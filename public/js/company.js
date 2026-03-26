'use strict';

let _companyInfo = null;
let _companyEditMode = false;

async function loadCompanyInfo() {
  try {
    const info = await API.get('/company');
    _companyInfo = info;
    renderCompanyInfo(info);
  } catch (err) { toast(err.message, 'error'); }
}

function renderCompanyInfo(info) {
  const isAdmin = currentUser?.role === 'admin';

  // 수정 버튼 권한
  document.getElementById('btn-company-edit').style.display = isAdmin ? '' : 'none';

  if (!info) {
    document.getElementById('company-empty').classList.remove('hidden');
    document.getElementById('company-view').classList.add('hidden');
    document.getElementById('company-form').classList.add('hidden');
    document.getElementById('btn-company-edit').style.display = isAdmin ? '' : 'none';
    if (isAdmin) {
      document.getElementById('btn-company-edit').textContent = '+ 등록';
    }
    return;
  }

  document.getElementById('company-empty').classList.add('hidden');
  document.getElementById('company-view').classList.remove('hidden');
  document.getElementById('company-form').classList.add('hidden');
  document.getElementById('btn-company-cancel').classList.add('hidden');
  document.getElementById('btn-company-save').classList.add('hidden');
  document.getElementById('btn-company-edit').classList.remove('hidden');
  document.getElementById('btn-company-edit').textContent = '수정';

  // 보기 채우기
  document.getElementById('cv-company-name').textContent   = info.company_name   || '-';
  document.getElementById('cv-representative').textContent = info.representative  || '-';
  document.getElementById('cv-biz').textContent            = fmtBizNum(info.business_number) || '-';
  document.getElementById('cv-phone').textContent          = fmtPhone(info.phone) || '-';
  document.getElementById('cv-fax').textContent            = fmtPhone(info.fax)   || '-';
  document.getElementById('cv-email').textContent          = info.email           || '-';
  document.getElementById('cv-address').textContent        = info.address         || '-';
  document.getElementById('cv-bank-name').textContent      = info.bank_name       || '-';
  document.getElementById('cv-account-number').textContent = info.account_number  ? fmtAccountNumber(info.account_number) : '-';
  document.getElementById('cv-account-holder').textContent = info.account_holder  || '-';
  document.getElementById('cv-notes').textContent          = info.notes           || '-';
  document.getElementById('cv-updated-at').textContent     = fmtDateTime(info.updated_at) || '-';
  document.getElementById('cv-updated-by').textContent     = info.updated_by_name || '-';

  // 사업자등록증 파일
  const licenseLink = document.getElementById('cv-license-link');
  const licenseNone = document.getElementById('cv-license-none');
  if (info.business_license_image) {
    licenseLink.href = info.business_license_image;
    licenseLink.classList.remove('hidden');
    licenseNone.classList.add('hidden');
  } else {
    licenseLink.classList.add('hidden');
    licenseNone.classList.remove('hidden');
  }
}

function companyStartEdit() {
  const info = _companyInfo;
  document.getElementById('company-view').classList.add('hidden');
  document.getElementById('company-empty').classList.add('hidden');
  document.getElementById('company-form').classList.remove('hidden');
  document.getElementById('btn-company-edit').classList.add('hidden');
  document.getElementById('btn-company-cancel').classList.remove('hidden');
  document.getElementById('btn-company-save').classList.remove('hidden');

  // 폼 채우기
  document.getElementById('cf-company-name').value    = info?.company_name   || '';
  document.getElementById('cf-representative').value  = info?.representative  || '';
  document.getElementById('cf-biz').value             = info?.business_number ? fmtBizNum(info.business_number).replace(/-/g,'') : '';
  document.getElementById('cf-phone').value           = info?.phone ? fmtPhone(info.phone).replace(/-/g,'') : '';
  document.getElementById('cf-fax').value             = info?.fax   ? fmtPhone(info.fax).replace(/-/g,'')   : '';
  document.getElementById('cf-email').value           = info?.email   || '';
  document.getElementById('cf-address').value         = info?.address || '';
  document.getElementById('cf-bank-name').value       = info?.bank_name || '';
  document.getElementById('cf-account-number').value  = info?.account_number || '';
  document.getElementById('cf-account-holder').value  = info?.account_holder || '';
  document.getElementById('cf-notes').value           = info?.notes || '';
  document.getElementById('cf-license-file').value    = '';

  const curLabel = document.getElementById('cf-license-current');
  curLabel.textContent = info?.business_license_image ? '현재 파일 등록됨 (새 파일 선택 시 교체)' : '';
}

function companyCancelEdit() {
  renderCompanyInfo(_companyInfo);
}

async function companySave() {
  const btn = document.getElementById('btn-company-save');
  btn.disabled = true;

  try {
    const formData = new FormData();
    formData.append('company_name',    document.getElementById('cf-company-name').value.trim());
    formData.append('representative',  document.getElementById('cf-representative').value.trim());
    formData.append('business_number', document.getElementById('cf-biz').value.replace(/\D/g,''));
    formData.append('phone',           document.getElementById('cf-phone').value.replace(/\D/g,''));
    formData.append('fax',             document.getElementById('cf-fax').value.replace(/\D/g,''));
    formData.append('email',           document.getElementById('cf-email').value.trim());
    formData.append('address',         document.getElementById('cf-address').value.trim());
    formData.append('bank_name',       document.getElementById('cf-bank-name').value);
    formData.append('account_number',  document.getElementById('cf-account-number').value.replace(/\D/g,''));
    formData.append('account_holder',  document.getElementById('cf-account-holder').value.trim());
    formData.append('notes',           document.getElementById('cf-notes').value.trim());

    const fileInput = document.getElementById('cf-license-file');
    if (fileInput.files[0]) formData.append('business_license_file', fileInput.files[0]);

    // multipart/form-data — fetch 직접 사용 (API 헬퍼는 JSON 전용)
    const res = await fetch('/api/company', {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
      body: formData,
    });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '저장 실패');

    _companyInfo = data;
    renderCompanyInfo(data);
    toast('회사 정보가 저장되었습니다.', 'success');
  } catch (err) { toast(err.message, 'error'); }
  finally { btn.disabled = false; }
}

// ── 이벤트 바인딩 ──
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-company-edit')?.addEventListener('click', companyStartEdit);
  document.getElementById('btn-company-register')?.addEventListener('click', companyStartEdit);
  document.getElementById('btn-company-cancel')?.addEventListener('click', companyCancelEdit);
  document.getElementById('btn-company-save')?.addEventListener('click', companySave);
});
