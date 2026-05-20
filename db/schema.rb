# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_05_20_090100) do
  create_table "comparison_usages", force: :cascade do |t|
    t.integer "comparisons_count", default: 0, null: false
    t.datetime "created_at", null: false
    t.date "period_start", null: false
    t.integer "products_count", default: 0, null: false
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["user_id", "period_start"], name: "index_comparison_usages_on_user_id_and_period_start", unique: true
    t.index ["user_id"], name: "index_comparison_usages_on_user_id"
  end

  create_table "users", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "email", default: "", null: false
    t.string "encrypted_password", default: "", null: false
    t.string "plan", default: "free", null: false
    t.datetime "remember_created_at"
    t.datetime "reset_password_sent_at"
    t.string "reset_password_token"
    t.string "stripe_customer_id"
    t.string "stripe_subscription_id"
    t.string "subscription_status", default: "inactive", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
    t.index ["reset_password_token"], name: "index_users_on_reset_password_token", unique: true
    t.index ["stripe_customer_id"], name: "index_users_on_stripe_customer_id", unique: true
    t.index ["stripe_subscription_id"], name: "index_users_on_stripe_subscription_id", unique: true
  end

  add_foreign_key "comparison_usages", "users"
end
