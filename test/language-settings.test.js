import test from "node:test";
import assert from "node:assert/strict";
import { formatPackSize, languagePackActions, languagePackStatus } from "../language-settings.js";

const basePack = Object.freeze({
  active: false,
  installed: false,
  updateAvailable: false,
  availableVersion: "0.20.14",
});

test("언어팩 상태는 다운로드·설치·업데이트·현재 사용 중을 구분한다", () => {
  assert.equal(languagePackStatus(basePack), "download");
  assert.equal(languagePackStatus({ ...basePack, installed: true }), "installed");
  assert.equal(languagePackStatus({ ...basePack, installed: true, updateAvailable: true }), "update");
  assert.equal(languagePackStatus({ ...basePack, installed: true, active: true }), "current");
  assert.equal(languagePackStatus({ ...basePack, availableVersion: null }), "unavailable");
});

test("진행 및 실패 상태는 기본 설치 상태보다 우선한다", () => {
  assert.equal(languagePackStatus(basePack, "download"), "downloading");
  assert.equal(languagePackStatus(basePack, "update"), "downloading");
  assert.equal(languagePackStatus(basePack, "delete"), "deleting");
  assert.equal(languagePackStatus(basePack, null, true), "failed");
});

test("현재 팩은 삭제할 수 없지만 새 버전이 있으면 업데이트할 수 있다", () => {
  assert.deepEqual(languagePackActions(basePack), ["download"]);
  assert.deepEqual(languagePackActions({ ...basePack, installed: true }), ["apply", "delete"]);
  assert.deepEqual(
    languagePackActions({ ...basePack, installed: true, updateAvailable: true }),
    ["apply", "update", "delete"],
  );
  assert.deepEqual(languagePackActions({ ...basePack, installed: true, active: true }), []);
  assert.deepEqual(
    languagePackActions({ ...basePack, installed: true, active: true, updateAvailable: true }),
    ["update"],
  );
  assert.deepEqual(languagePackActions({ ...basePack, availableVersion: null }), []);
  assert.deepEqual(languagePackActions(basePack, true), ["retry"]);
});

test("언어팩 크기는 사람이 읽기 쉬운 KB로 표시한다", () => {
  assert.equal(formatPackSize(54_400, "en"), "53.1 KB");
  assert.equal(formatPackSize(null, "en"), null);
});
