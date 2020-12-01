#include "crypto/crypto_ecdh.h"
#include "crypto/crypto_common.h"
#include "crypto/crypto_util.h"
#include "allocated_buffer-inl.h"
#include "async_wrap-inl.h"
#include "base_object-inl.h"
#include "env-inl.h"
#include "memory_tracker-inl.h"
#include "node_buffer.h"
#include "threadpoolwork-inl.h"
#include "v8.h"

#include <openssl/bn.h>
#include <openssl/ec.h>
#include <openssl/ecdh.h>

namespace node {

using v8::Array;
using v8::FunctionCallbackInfo;
using v8::FunctionTemplate;
using v8::Int32;
using v8::Just;
using v8::Local;
using v8::Maybe;
using v8::Nothing;
using v8::Object;
using v8::String;
using v8::Uint32;
using v8::Value;

namespace crypto {
namespace {
int GetCurveFromName(const char* name) {
  int nid = EC_curve_nist2nid(name);
  if (nid == NID_undef)
    nid = OBJ_sn2nid(name);
  return nid;
}
}  // namespace

void ECDH::Initialize(Environment* env, Local<Object> target) {
  Local<FunctionTemplate> t = env->NewFunctionTemplate(New);
  t->Inherit(BaseObject::GetConstructorTemplate(env));

  t->InstanceTemplate()->SetInternalFieldCount(ECDH::kInternalFieldCount);

  env->SetProtoMethod(t, "generateKeys", GenerateKeys);
  env->SetProtoMethod(t, "computeSecret", ComputeSecret);
  env->SetProtoMethodNoSideEffect(t, "getPublicKey", GetPublicKey);
  env->SetProtoMethodNoSideEffect(t, "getPrivateKey", GetPrivateKey);
  env->SetProtoMethod(t, "setPublicKey", SetPublicKey);
  env->SetProtoMethod(t, "setPrivateKey", SetPrivateKey);

  target->Set(env->context(),
              FIXED_ONE_BYTE_STRING(env->isolate(), "ECDH"),
              t->GetFunction(env->context()).ToLocalChecked()).Check();

  env->SetMethodNoSideEffect(target, "ECDHConvertKey", ECDH::ConvertKey);
  env->SetMethodNoSideEffect(target, "getCurves", ECDH::GetCurves);

  ECDHBitsJob::Initialize(env, target);
  ECKeyPairGenJob::Initialize(env, target);
  ECKeyExportJob::Initialize(env, target);

  NODE_DEFINE_CONSTANT(target, OPENSSL_EC_NAMED_CURVE);
  NODE_DEFINE_CONSTANT(target, OPENSSL_EC_EXPLICIT_CURVE);
}

void ECDH::GetCurves(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);
  const size_t num_curves = EC_get_builtin_curves(nullptr, 0);

  if (num_curves) {
    std::vector<EC_builtin_curve> curves(num_curves);

    if (EC_get_builtin_curves(curves.data(), num_curves)) {
      std::vector<Local<Value>> arr(num_curves);

      for (size_t i = 0; i < num_curves; i++)
        arr[i] = OneByteString(env->isolate(), OBJ_nid2sn(curves[i].nid));

      args.GetReturnValue().Set(
          Array::New(env->isolate(), arr.data(), arr.size()));
      return;
    }
  }

  args.GetReturnValue().Set(Array::New(env->isolate()));
}

ECDH::ECDH(Environment* env, Local<Object> wrap, ECKeyPointer&& key)
    : BaseObject(env, wrap),
    key_(std::move(key)),
    group_(EC_KEY_get0_group(key_.get())) {
  MakeWeak();
  CHECK_NOT_NULL(group_);
}

void ECDH::MemoryInfo(MemoryTracker* tracker) const {
  tracker->TrackFieldWithSize("key", key_ ? kSizeOf_EC_KEY : 0);
}

ECDH::~ECDH() {}

void ECDH::New(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);

  MarkPopErrorOnReturn mark_pop_error_on_return;

  // TODO(indutny): Support raw curves?
  CHECK(args[0]->IsString());
  node::Utf8Value curve(env->isolate(), args[0]);

  int nid = OBJ_sn2nid(*curve);
  if (nid == NID_undef)
    return THROW_ERR_CRYPTO_INVALID_CURVE(env);

  ECKeyPointer key(EC_KEY_new_by_curve_name(nid));
  if (!key)
    return THROW_ERR_CRYPTO_OPERATION_FAILED(env,
      "Failed to create key using named curve");

  new ECDH(env, args.This(), std::move(key));
}

void ECDH::GenerateKeys(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);

  ECDH* ecdh;
  ASSIGN_OR_RETURN_UNWRAP(&ecdh, args.Holder());

  if (!EC_KEY_generate_key(ecdh->key_.get()))
    return THROW_ERR_CRYPTO_OPERATION_FAILED(env, "Failed to generate key");
}

ECPointPointer ECDH::BufferToPoint(Environment* env,
                                   const EC_GROUP* group,
                                   Local<Value> buf) {
  int r;

  ECPointPointer pub(EC_POINT_new(group));
  if (!pub) {
    THROW_ERR_CRYPTO_OPERATION_FAILED(env,
        "Failed to allocate EC_POINT for a public key");
    return pub;
  }

  ArrayBufferOrViewContents<unsigned char> input(buf);
  if (UNLIKELY(!input.CheckSizeInt32())) {
    THROW_ERR_OUT_OF_RANGE(env, "buffer is too big");
    return ECPointPointer();
  }
  r = EC_POINT_oct2point(
      group,
      pub.get(),
      input.data(),
      input.size(),
      nullptr);
  if (!r)
    return ECPointPointer();

  return pub;
}

void ECDH::ComputeSecret(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);

  CHECK(IsAnyByteSource(args[0]));

  ECDH* ecdh;
  ASSIGN_OR_RETURN_UNWRAP(&ecdh, args.Holder());

  MarkPopErrorOnReturn mark_pop_error_on_return;

  if (!ecdh->IsKeyPairValid())
    return THROW_ERR_CRYPTO_INVALID_KEYPAIR(env);

  ECPointPointer pub(
      ECDH::BufferToPoint(env,
                          ecdh->group_,
                          args[0]));
  if (!pub) {
    args.GetReturnValue().Set(
        FIXED_ONE_BYTE_STRING(env->isolate(),
        "ERR_CRYPTO_ECDH_INVALID_PUBLIC_KEY"));
    return;
  }

  // NOTE: field_size is in bits
  int field_size = EC_GROUP_get_degree(ecdh->group_);
  size_t out_len = (field_size + 7) / 8;
  AllocatedBuffer out = AllocatedBuffer::AllocateManaged(env, out_len);

  int r = ECDH_compute_key(
      out.data(), out_len, pub.get(), ecdh->key_.get(), nullptr);
  if (!r)
    return THROW_ERR_CRYPTO_OPERATION_FAILED(env, "Failed to compute ECDH key");

  args.GetReturnValue().Set(out.ToBuffer().FromMaybe(Local<Value>()));
}

void ECDH::GetPublicKey(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);

  // Conversion form
  CHECK_EQ(args.Length(), 1);

  ECDH* ecdh;
  ASSIGN_OR_RETURN_UNWRAP(&ecdh, args.Holder());

  const EC_GROUP* group = EC_KEY_get0_group(ecdh->key_.get());
  const EC_POINT* pub = EC_KEY_get0_public_key(ecdh->key_.get());
  if (pub == nullptr)
    return THROW_ERR_CRYPTO_OPERATION_FAILED(env,
        "Failed to get ECDH public key");

  CHECK(args[0]->IsUint32());
  uint32_t val = args[0].As<Uint32>()->Value();
  point_conversion_form_t form = static_cast<point_conversion_form_t>(val);

  const char* error;
  Local<Object> buf;
  if (!ECPointToBuffer(env, group, pub, form, &error).ToLocal(&buf))
    return THROW_ERR_CRYPTO_OPERATION_FAILED(env, error);
  args.GetReturnValue().Set(buf);
}

void ECDH::GetPrivateKey(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);

  ECDH* ecdh;
  ASSIGN_OR_RETURN_UNWRAP(&ecdh, args.Holder());

  const BIGNUM* b = EC_KEY_get0_private_key(ecdh->key_.get());
  if (b == nullptr)
    return THROW_ERR_CRYPTO_OPERATION_FAILED(env,
        "Failed to get ECDH private key");

  const int size = BN_num_bytes(b);
  AllocatedBuffer out = AllocatedBuffer::AllocateManaged(env, size);
  CHECK_EQ(size, BN_bn2binpad(b,
                              reinterpret_cast<unsigned char*>(out.data()),
                              size));

  args.GetReturnValue().Set(out.ToBuffer().FromMaybe(Local<Value>()));
}

void ECDH::SetPrivateKey(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);

  ECDH* ecdh;
  ASSIGN_OR_RETURN_UNWRAP(&ecdh, args.Holder());

  ArrayBufferOrViewContents<unsigned char> priv_buffer(args[0]);
  if (UNLIKELY(!priv_buffer.CheckSizeInt32()))
    return THROW_ERR_OUT_OF_RANGE(env, "key is too big");

  BignumPointer priv(BN_bin2bn(
      priv_buffer.data(), priv_buffer.size(), nullptr));
  if (!priv) {
    return THROW_ERR_CRYPTO_OPERATION_FAILED(env,
        "Failed to convert Buffer to BN");
  }

  if (!ecdh->IsKeyValidForCurve(priv)) {
    return THROW_ERR_CRYPTO_INVALID_KEYTYPE(env,
        "Private key is not valid for specified curve.");
  }

  ECKeyPointer new_key(EC_KEY_dup(ecdh->key_.get()));
  CHECK(new_key);

  int result = EC_KEY_set_private_key(new_key.get(), priv.get());
  priv.reset();

  if (!result) {
    return THROW_ERR_CRYPTO_OPERATION_FAILED(env,
        "Failed to convert BN to a private key");
  }

  MarkPopErrorOnReturn mark_pop_error_on_return;
  USE(&mark_pop_error_on_return);

  const BIGNUM* priv_key = EC_KEY_get0_private_key(new_key.get());
  CHECK_NOT_NULL(priv_key);

  ECPointPointer pub(EC_POINT_new(ecdh->group_));
  CHECK(pub);

  if (!EC_POINT_mul(ecdh->group_, pub.get(), priv_key,
                    nullptr, nullptr, nullptr)) {
    return THROW_ERR_CRYPTO_OPERATION_FAILED(env,
        "Failed to generate ECDH public key");
  }

  if (!EC_KEY_set_public_key(new_key.get(), pub.get()))
    return THROW_ERR_CRYPTO_OPERATION_FAILED(env,
        "Failed to set generated public key");

  EC_KEY_copy(ecdh->key_.get(), new_key.get());
  ecdh->group_ = EC_KEY_get0_group(ecdh->key_.get());
}

void ECDH::SetPublicKey(const FunctionCallbackInfo<Value>& args) {
  Environment* env = Environment::GetCurrent(args);

  ECDH* ecdh;
  ASSIGN_OR_RETURN_UNWRAP(&ecdh, args.Holder());

  CHECK(IsAnyByteSource(args[0]));

  MarkPopErrorOnReturn mark_pop_error_on_return;

  ECPointPointer pub(
      ECDH::BufferToPoint(env,
                          ecdh->group_,
                          args[0]));
  if (!pub) {
    return THROW_ERR_CRYPTO_OPERATION_FAILED(env,
        "Failed to convert Buffer to EC_POINT");
  }

  int r = EC_KEY_set_public_key(ecdh->key_.get(), pub.get());
  if (!r) {
    return THROW_ERR_CRYPTO_OPERATION_FAILED(env,
        "Failed to set EC_POINT as the public key");
  }
}

bool ECDH::IsKeyValidForCurve(const BignumPointer& private_key) {
  CHECK(group_);
  CHECK(private_key);
  // Private keys must be in the range [1, n-1].
  // Ref: Section 3.2.1 - http://www.secg.org/sec1-v2.pdf
  if (BN_cmp(private_key.get(), BN_value_one()) < 0) {
    return false;
  }
  BignumPointer order(BN_new());
  CHECK(order);
  return EC_GROUP_get_order(group_, order.get(), nullptr) &&
         BN_cmp(private_key.get(), order.get()) < 0;
}

bool ECDH::IsKeyPairValid() {
  MarkPopErrorOnReturn mark_pop_error_on_return;
  USE(&mark_pop_error_on_return);
  return 1 == EC_KEY_check_key(key_.get());
}

// Convert the input public key to compressed, uncompressed, or hybrid formats.
void ECDH::ConvertKey(const FunctionCallbackInfo<Value>& args) {
  MarkPopErrorOnReturn mark_pop_error_on_return;
  Environment* env = Environment::GetCurrent(args);

  CHECK_EQ(args.Length(), 3);
  CHECK(IsAnyByteSource(args[0]));

  ArrayBufferOrViewContents<char> args0(args[0]);
  if (UNLIKELY(!args0.CheckSizeInt32()))
    return THROW_ERR_OUT_OF_RANGE(env, "key is too big");
  if (args0.size() == 0)
    return args.GetReturnValue().SetEmptyString();

  node::Utf8Value curve(env->isolate(), args[1]);

  int nid = OBJ_sn2nid(*curve);
  if (nid == NID_undef)
    return THROW_ERR_CRYPTO_INVALID_CURVE(env);

  ECGroupPointer group(
      EC_GROUP_new_by_curve_name(nid));
  if (group == nullptr)
    return THROW_ERR_CRYPTO_OPERATION_FAILED(env, "Failed to get EC_GROUP");

  ECPointPointer pub(
      ECDH::BufferToPoint(env,
                          group.get(),
                          args[0]));

  if (pub == nullptr) {
    return THROW_ERR_CRYPTO_OPERATION_FAILED(env,
        "Failed to convert Buffer to EC_POINT");
  }

  CHECK(args[2]->IsUint32());
  uint32_t val = args[2].As<Uint32>()->Value();
  point_conversion_form_t form = static_cast<point_conversion_form_t>(val);

  const char* error;
  Local<Object> buf;
  if (!ECPointToBuffer(env, group.get(), pub.get(), form, &error).ToLocal(&buf))
    return THROW_ERR_CRYPTO_OPERATION_FAILED(env, error);
  args.GetReturnValue().Set(buf);
}

Maybe<bool> ECDHBitsTraits::EncodeOutput(
    Environment* env,
    const ECDHBitsConfig& params,
    ByteSource* out,
    v8::Local<v8::Value>* result) {
  *result = out->ToArrayBuffer(env);
  return Just(!result->IsEmpty());
}

Maybe<bool> ECDHBitsTraits::AdditionalConfig(
    CryptoJobMode mode,
    const FunctionCallbackInfo<Value>& args,
    unsigned int offset,
    ECDHBitsConfig* params) {
  Environment* env = Environment::GetCurrent(args);

  CHECK(args[offset]->IsString());  // curve name
  CHECK(args[offset + 1]->IsObject());  // public key
  CHECK(args[offset + 2]->IsObject());  // private key

  KeyObjectHandle* private_key;
  KeyObjectHandle* public_key;

  Utf8Value name(env->isolate(), args[offset]);
  ASSIGN_OR_RETURN_UNWRAP(&public_key, args[offset + 1], Nothing<bool>());
  ASSIGN_OR_RETURN_UNWRAP(&private_key, args[offset + 2], Nothing<bool>());

  if (private_key->Data()->GetKeyType() != kKeyTypePrivate ||
      public_key->Data()->GetKeyType() != kKeyTypePublic) {
    THROW_ERR_CRYPTO_INVALID_KEYTYPE(env);
    return Nothing<bool>();
  }

  params->private_key = ECKeyPointer(
      EC_KEY_dup(
          EVP_PKEY_get1_EC_KEY(private_key->Data()->GetAsymmetricKey().get())));
  if (!params->private_key) {
    THROW_ERR_CRYPTO_INVALID_KEYTYPE(env);
    return Nothing<bool>();
  }

  params->public_key = ECKeyPointer(
      EC_KEY_dup(
          EVP_PKEY_get1_EC_KEY(public_key->Data()->GetAsymmetricKey().get())));
  if (!params->public_key) {
    THROW_ERR_CRYPTO_INVALID_KEYTYPE(env);
    return Nothing<bool>();
  }

  params->group = EC_KEY_get0_group(params->private_key.get());

  return Just(true);
}

bool ECDHBitsTraits::DeriveBits(
    Environment* env,
    const ECDHBitsConfig& params,
    ByteSource* out) {
  if (params.group == nullptr)
    return false;
  CHECK_EQ(EC_KEY_check_key(params.private_key.get()), 1);
  CHECK_EQ(EC_KEY_check_key(params.public_key.get()), 1);
  const EC_POINT* pub = EC_KEY_get0_public_key(params.public_key.get());
  int field_size = EC_GROUP_get_degree(params.group);
  size_t len = (field_size + 7) / 8;
  char* data = MallocOpenSSL<char>(len);
  ByteSource buf = ByteSource::Allocated(data, len);
  if (ECDH_compute_key(
          data,
          len,
          pub,
          params.private_key.get(),
          nullptr) <= 0) {
    return false;
  }
  *out = std::move(buf);
  return true;
}

EVPKeyCtxPointer EcKeyGenTraits::Setup(EcKeyPairGenConfig* params) {
  EVPKeyCtxPointer param_ctx(EVP_PKEY_CTX_new_id(EVP_PKEY_EC, nullptr));
  EVP_PKEY* raw_params = nullptr;
  if (!param_ctx ||
      EVP_PKEY_paramgen_init(param_ctx.get()) <= 0 ||
      EVP_PKEY_CTX_set_ec_paramgen_curve_nid(
          param_ctx.get(), params->params.curve_nid) <= 0 ||
      EVP_PKEY_CTX_set_ec_param_enc(
          param_ctx.get(), params->params.param_encoding) <= 0 ||
      EVP_PKEY_paramgen(param_ctx.get(), &raw_params) <= 0) {
    return EVPKeyCtxPointer();
  }
  EVPKeyPointer key_params(raw_params);
  EVPKeyCtxPointer key_ctx(EVP_PKEY_CTX_new(key_params.get(), nullptr));

  if (!key_ctx || EVP_PKEY_keygen_init(key_ctx.get()) <= 0)
    return EVPKeyCtxPointer();

  return key_ctx;
}

// EcKeyPairGenJob input arguments
//   1. CryptoJobMode
//   2. Curve Name
//   3. Param Encoding
//   4. Public Format
//   5. Public Type
//   6. Private Format
//   7. Private Type
//   8. Cipher
//   9. Passphrase
Maybe<bool> EcKeyGenTraits::AdditionalConfig(
    CryptoJobMode mode,
    const FunctionCallbackInfo<Value>& args,
    unsigned int* offset,
    EcKeyPairGenConfig* params) {
  Environment* env = Environment::GetCurrent(args);
  CHECK(args[*offset]->IsString());  // curve name
  CHECK(args[*offset + 1]->IsInt32());  // param encoding

  Utf8Value curve_name(env->isolate(), args[*offset]);
  params->params.curve_nid = GetCurveFromName(*curve_name);
  if (params->params.curve_nid == NID_undef) {
    THROW_ERR_CRYPTO_INVALID_CURVE(env);
    return Nothing<bool>();
  }

  params->params.param_encoding = args[*offset + 1].As<Int32>()->Value();
  if (params->params.param_encoding != OPENSSL_EC_NAMED_CURVE &&
      params->params.param_encoding != OPENSSL_EC_EXPLICIT_CURVE) {
    THROW_ERR_OUT_OF_RANGE(env, "Invalid param_encoding specified");
    return Nothing<bool>();
  }

  *offset += 2;

  return Just(true);
}

namespace {
WebCryptoKeyExportStatus EC_Raw_Export(
    KeyObjectData* key_data,
    const ECKeyExportConfig& params,
    ByteSource* out) {
  CHECK(key_data->GetAsymmetricKey());

  EC_KEY* ec_key = EVP_PKEY_get0_EC_KEY(key_data->GetAsymmetricKey().get());
  CHECK_NOT_NULL(ec_key);

  const EC_GROUP* group = EC_KEY_get0_group(ec_key);
  const EC_POINT* point = EC_KEY_get0_public_key(ec_key);
  point_conversion_form_t form = POINT_CONVERSION_UNCOMPRESSED;

  // Get the allocated data size...
  size_t len = EC_POINT_point2oct(group, point, form, nullptr, 0, nullptr);
  if (len == 0)
    return WebCryptoKeyExportStatus::FAILED;

  unsigned char* data = MallocOpenSSL<unsigned char>(len);
  size_t check_len = EC_POINT_point2oct(group, point, form, data, len, nullptr);
  if (check_len == 0)
    return WebCryptoKeyExportStatus::FAILED;

  CHECK_EQ(len, check_len);

  *out = ByteSource::Allocated(reinterpret_cast<char*>(data), len);

  return WebCryptoKeyExportStatus::OK;
}
}  // namespace

Maybe<bool> ECKeyExportTraits::AdditionalConfig(
    const FunctionCallbackInfo<Value>& args,
    unsigned int offset,
    ECKeyExportConfig* params) {
  return Just(true);
}

WebCryptoKeyExportStatus ECKeyExportTraits::DoExport(
    std::shared_ptr<KeyObjectData> key_data,
    WebCryptoKeyFormat format,
    const ECKeyExportConfig& params,
    ByteSource* out) {
  CHECK_NE(key_data->GetKeyType(), kKeyTypeSecret);

  switch (format) {
    case kWebCryptoKeyFormatRaw:
      if (key_data->GetKeyType() != kKeyTypePublic)
        return WebCryptoKeyExportStatus::INVALID_KEY_TYPE;
      return EC_Raw_Export(key_data.get(), params, out);
    case kWebCryptoKeyFormatPKCS8:
      if (key_data->GetKeyType() != kKeyTypePrivate)
        return WebCryptoKeyExportStatus::INVALID_KEY_TYPE;
      return PKEY_PKCS8_Export(key_data.get(), out);
    case kWebCryptoKeyFormatSPKI:
      if (key_data->GetKeyType() != kKeyTypePublic)
        return WebCryptoKeyExportStatus::INVALID_KEY_TYPE;
      return PKEY_SPKI_Export(key_data.get(), out);
    default:
      UNREACHABLE();
  }
}

Maybe<bool> ExportJWKEcKey(
    Environment* env,
    std::shared_ptr<KeyObjectData> key,
    Local<Object> target) {
  ManagedEVPPKey pkey = key->GetAsymmetricKey();
  CHECK_EQ(EVP_PKEY_id(pkey.get()), EVP_PKEY_EC);

  EC_KEY* ec = EVP_PKEY_get0_EC_KEY(pkey.get());
  CHECK_NOT_NULL(ec);

  const EC_POINT* pub = EC_KEY_get0_public_key(ec);
  const EC_GROUP* group = EC_KEY_get0_group(ec);

  int degree_bits = EC_GROUP_get_degree(group);
  int degree_bytes =
    (degree_bits / CHAR_BIT) + (7 + (degree_bits % CHAR_BIT)) / 8;

  BignumPointer x(BN_new());
  BignumPointer y(BN_new());

  EC_POINT_get_affine_coordinates(group, pub, x.get(), y.get(), nullptr);

  if (target->Set(
          env->context(),
          env->jwk_kty_string(),
          env->jwk_ec_string()).IsNothing()) {
    return Nothing<bool>();
  }

  if (SetEncodedValue(
          env,
          target,
          env->jwk_x_string(),
          x.get(),
          degree_bytes).IsNothing() ||
      SetEncodedValue(
          env,
          target,
          env->jwk_y_string(),
          y.get(),
          degree_bytes).IsNothing()) {
    return Nothing<bool>();
  }

  if (key->GetKeyType() == kKeyTypePrivate) {
    const BIGNUM* pvt = EC_KEY_get0_private_key(ec);
    return SetEncodedValue(
      env,
      target,
      env->jwk_d_string(),
      pvt,
      degree_bytes);
  }

  return Just(true);
}

std::shared_ptr<KeyObjectData> ImportJWKEcKey(
    Environment* env,
    Local<Object> jwk,
    const FunctionCallbackInfo<Value>& args,
    unsigned int offset) {
  CHECK(args[offset]->IsString());  // curve name
  Utf8Value curve(env->isolate(), args[offset].As<String>());

  int nid = GetCurveFromName(*curve);
  if (nid == NID_undef) {  // Unknown curve
    THROW_ERR_CRYPTO_INVALID_CURVE(env);
    return std::shared_ptr<KeyObjectData>();
  }

  Local<Value> x_value;
  Local<Value> y_value;
  Local<Value> d_value;

  if (!jwk->Get(env->context(), env->jwk_x_string()).ToLocal(&x_value) ||
      !jwk->Get(env->context(), env->jwk_y_string()).ToLocal(&y_value) ||
      !jwk->Get(env->context(), env->jwk_d_string()).ToLocal(&d_value)) {
    return std::shared_ptr<KeyObjectData>();
  }

  if (!x_value->IsString() ||
      !y_value->IsString() ||
      (!d_value->IsUndefined() && !d_value->IsString())) {
    THROW_ERR_CRYPTO_INVALID_JWK(env, "Invalid JWK EC key");
    return std::shared_ptr<KeyObjectData>();
  }

  KeyType type = d_value->IsString() ? kKeyTypePrivate : kKeyTypePublic;

  ECKeyPointer ec(EC_KEY_new_by_curve_name(nid));
  if (!ec) {
    THROW_ERR_CRYPTO_INVALID_JWK(env, "Invalid JWK EC key");
    return std::shared_ptr<KeyObjectData>();
  }

  ByteSource x = ByteSource::FromEncodedString(env, x_value.As<String>());
  ByteSource y = ByteSource::FromEncodedString(env, y_value.As<String>());

  if (!EC_KEY_set_public_key_affine_coordinates(
          ec.get(),
          x.ToBN().get(),
          y.ToBN().get())) {
    THROW_ERR_CRYPTO_INVALID_JWK(env, "Invalid JWK EC key");
    return std::shared_ptr<KeyObjectData>();
  }

  if (type == kKeyTypePrivate) {
    ByteSource d = ByteSource::FromEncodedString(env, d_value.As<String>());
    if (!EC_KEY_set_private_key(ec.get(), d.ToBN().get())) {
      THROW_ERR_CRYPTO_INVALID_JWK(env, "Invalid JWK EC key");
      return std::shared_ptr<KeyObjectData>();
    }
  }

  EVPKeyPointer pkey(EVP_PKEY_new());
  CHECK_EQ(EVP_PKEY_set1_EC_KEY(pkey.get(), ec.get()), 1);

  return KeyObjectData::CreateAsymmetric(type, ManagedEVPPKey(std::move(pkey)));
}

Maybe<bool> GetEcKeyDetail(
    Environment* env,
    std::shared_ptr<KeyObjectData> key,
    Local<Object> target) {
  ManagedEVPPKey pkey = key->GetAsymmetricKey();
  CHECK_EQ(EVP_PKEY_id(pkey.get()), EVP_PKEY_EC);

  EC_KEY* ec = EVP_PKEY_get0_EC_KEY(pkey.get());
  CHECK_NOT_NULL(ec);

  const EC_GROUP* group = EC_KEY_get0_group(ec);
  int nid = EC_GROUP_get_curve_name(group);

  return target->Set(
      env->context(),
      env->named_curve_string(),
      OneByteString(env->isolate(), OBJ_nid2sn(nid)));
}

// WebCrypto requires a different format for ECDSA signatures than
// what OpenSSL produces, so we need to convert between them. The
// implementation here is a adapted from Chromium's impl here:
// https://github.com/chromium/chromium/blob/7af6cfd/components/webcrypto/algorithms/ecdsa.cc

size_t GroupOrderSize(ManagedEVPPKey key) {
  EC_KEY* ec = EVP_PKEY_get0_EC_KEY(key.get());
  CHECK_NOT_NULL(ec);
  const EC_GROUP* group = EC_KEY_get0_group(ec);
  BignumPointer order(BN_new());
  CHECK(EC_GROUP_get_order(group, order.get(), nullptr));
  return BN_num_bytes(order.get());
}

ByteSource ConvertToWebCryptoSignature(
    ManagedEVPPKey key,
    const ByteSource& signature) {
  const unsigned char* data =
      reinterpret_cast<const unsigned char*>(signature.get());
  EcdsaSigPointer ecsig(d2i_ECDSA_SIG(nullptr, &data, signature.size()));

  if (!ecsig)
    return ByteSource();

  size_t order_size_bytes = GroupOrderSize(key);
  char* outdata = MallocOpenSSL<char>(order_size_bytes * 2);
  ByteSource out = ByteSource::Allocated(outdata, order_size_bytes * 2);
  unsigned char* ptr = reinterpret_cast<unsigned char*>(outdata);

  const BIGNUM* pr;
  const BIGNUM* ps;
  ECDSA_SIG_get0(ecsig.get(), &pr, &ps);

  if (!BN_bn2binpad(pr, ptr, order_size_bytes) ||
      !BN_bn2binpad(ps, ptr + order_size_bytes, order_size_bytes)) {
    return ByteSource();
  }
  return out;
}

ByteSource ConvertFromWebCryptoSignature(
    ManagedEVPPKey key,
    const ByteSource& signature) {
  size_t order_size_bytes = GroupOrderSize(key);

  // If the size of the signature is incorrect, verification
  // will fail.
  if (signature.size() != 2 * order_size_bytes)
    return ByteSource();  // Empty!

  EcdsaSigPointer ecsig(ECDSA_SIG_new());
  if (!ecsig)
    return ByteSource();

  BignumPointer r(BN_new());
  BignumPointer s(BN_new());

  const unsigned char* sig = signature.data<unsigned char>();

  if (!BN_bin2bn(sig, order_size_bytes, r.get()) ||
      !BN_bin2bn(sig + order_size_bytes, order_size_bytes, s.get()) ||
      !ECDSA_SIG_set0(ecsig.get(), r.release(), s.release())) {
    return ByteSource();
  }

  int size = i2d_ECDSA_SIG(ecsig.get(), nullptr);
  char* data = MallocOpenSSL<char>(size);
  unsigned char* ptr = reinterpret_cast<unsigned char*>(data);
  CHECK_EQ(i2d_ECDSA_SIG(ecsig.get(), &ptr), size);
  return ByteSource::Allocated(data, size);
}

}  // namespace crypto
}  // namespace node
